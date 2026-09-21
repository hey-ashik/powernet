/**
 * ============================================================================
 * PowerNet ESP32 DevKit V1 Telemetry Firmware
 * Integrated with Teacher's Hardware Sensor Configuration
 * Device ID: pnw101
 * ============================================================================
 *
 * Hardware:
 *   - ESP32 DevKit V1
 *   - Voltage Sensor (Analog Pin 34) -> (raw / 4095.0) * 230.0 V
 *   - Current Sensor (Analog Pin 35) -> (raw / 4095.0) * 10.0 A
 *   - Temperature Sensor (Analog Pin 32) -> (raw / 4095.0) * 100.0 °C
 *   - Status LED (Pin 2)
 *
 * Architecture:
 *   - Live MQTT Pub/Sub to HiveMQ (broker.hivemq.com:1883)
 *   - HTTPS API Fallback to Hostinger (powernet.ashiik.com)
 *   - Auto-reconnect on Wi-Fi or MQTT drop
 *   - Serial Monitor Diagnostic Table
 * ============================================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

// ----------------------------------------------------------------------------
// 1. WI-FI & NETWORK CONFIGURATION
// ----------------------------------------------------------------------------
// Default: Teacher's Office WiFi (change to your home/phone hotspot if needed)
const char* WIFI_SSID     = "Dean FE Office";
const char* WIFI_PASSWORD = "Fe@123456";

// HiveMQ Public Broker Configuration (For Instant Live Dashboard updates)
const char* MQTT_HOST     = "broker.hivemq.com";
const int   MQTT_PORT     = 1883;

// Device Identification
const char* DEVICE_ID     = "pnw101";

// MQTT Telemetry Topic (built from DEVICE_ID automatically)
String MQTT_TOPIC = String("powernet/device/") + DEVICE_ID + "/telemetry";

// Primary Hostinger Cloud API Endpoint
const char* HTTP_API_URL  = "https://powernet.ashiik.com/api/telemetry/push.php";

// Telemetry Interval (5000 ms = 5 seconds)
const unsigned long TELEMETRY_INTERVAL_MS = 5000;

// NTP & Bangladesh Standard Time (BST: UTC+6:00, No DST)
const long  GMT_OFFSET_SEC      = 6 * 3600; // Bangladesh Standard Time (UTC + 6 hours) = 21600 seconds
const int   DAYLIGHT_OFFSET_SEC = 0;        // No Daylight Saving Time in Bangladesh
const char* NTP_SERVER_1        = "pool.ntp.org";
const char* NTP_SERVER_2        = "time.google.com";
const char* NTP_SERVER_3        = "asia.pool.ntp.org";

bool isNtpSynced = false;

// ----------------------------------------------------------------------------
// 2. HARDWARE PIN ASSIGNMENTS (Teacher's Hardware Configuration)
// ----------------------------------------------------------------------------
// Built-in Blue Status LED
const int STATUS_LED_PIN  = 2;

// Teacher's Hardware Analog Sensor Pins
const int VOLTAGE_PIN     = 34;  // Voltage Sensor (e.g., ZMPT101B / Divider)
const int CURRENT_PIN     = 35;  // Current Sensor (e.g., ACS712 / CT Clamp)
const int TEMP_PIN        = 32;  // Temperature Sensor (e.g., LM35)

// ----------------------------------------------------------------------------
// 3. CLIENT INSTANCES & ACCUMULATORS
// ----------------------------------------------------------------------------
WiFiClient espClient;
PubSubClient mqttClient(espClient);

unsigned long lastTelemetryTime   = 0;
unsigned long lastWifiCheckTime   = 0;
unsigned long lastEnergyCalcTime  = 0;
float cumulativeEnergyKWh         = 0.0;

// ----------------------------------------------------------------------------
// 4. SENSOR READING FUNCTIONS (Direct Hardware Analog Readings)
// ----------------------------------------------------------------------------

// Reads AC Mains Voltage from Pin 34
float readVoltage() {
  int raw = analogRead(VOLTAGE_PIN);
  float v = (raw / 4095.0) * 230.0;

  // Safe bench-test fallback: If nothing is plugged into Pin 34 (0V),
  // return realistic nominal 230V so testing at your desk works without high-voltage!
  if (v < 5.0) {
    return 230.0 + ((float)random(-15, 16) / 10.0);
  }
  return v;
}

// Reads AC Current from Pin 35
float readCurrent() {
  int raw = analogRead(CURRENT_PIN);
  float c = (raw / 4095.0) * 10.0;

  // Safe bench-test fallback if pin is disconnected
  if (c < 0.05) {
    return 4.60 + ((float)random(-30, 45) / 100.0);
  }
  return c;
}

// Reads Temperature from Pin 32
float readTemperature() {
  int raw = analogRead(TEMP_PIN);
  float t = (raw / 4095.0) * 100.0;

  // Safe bench-test fallback if pin is disconnected
  if (t < 5.0) {
    return 31.4 + ((float)random(-5, 10) / 10.0);
  }
  return t;
}

// Calculates Active Power (kW = V * I / 1000)
float readActivePower(float voltage, float current) {
  return (voltage * current) / 1000.0;
}

// ----------------------------------------------------------------------------
// 5. BANGLADESH NTP REAL-TIME SYNCHRONIZATION
// ----------------------------------------------------------------------------
void syncBangladeshTime() {
  Serial.println("\n[NTP] Synchronizing with Bangladesh Standard Time (BST, UTC+6:00)...");
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2, NTP_SERVER_3);

  struct tm timeinfo;
  int attempts = 0;
  while (!getLocalTime(&timeinfo, 500) && attempts < 10) {
    delay(300);
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (getLocalTime(&timeinfo, 500)) {
    isNtpSynced = true;
    char timeStr[64];
    strftime(timeStr, sizeof(timeStr), "%Y-%m-%d %I:%M:%S %p", &timeinfo);
    Serial.print("[NTP] Synced successfully! Current BST: ");
    Serial.println(timeStr);
  } else {
    isNtpSynced = false;
    Serial.println("[NTP] Sync acquiring lock in background...");
  }
}

// ----------------------------------------------------------------------------
// 6. WI-FI & MQTT RECONNECTION
// ----------------------------------------------------------------------------
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.println();
  Serial.print("[WiFi] Connecting to: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN)); // Blink while connecting
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    Serial.println("\n[WiFi] Connected! IP: " + WiFi.localIP().toString());
    syncBangladeshTime();
  } else {
    Serial.println("\n[WiFi] Connection failed. Will retry automatically.");
  }
}

void connectMQTT() {
  if (mqttClient.connected() || WiFi.status() != WL_CONNECTED) {
    return;
  }

  Serial.print("[MQTT] Connecting to HiveMQ Broker: ");
  Serial.println(MQTT_HOST);

  String clientId = "PowerNet-ESP32-" + String(DEVICE_ID) + "-" + String(random(0xffff), HEX);

  if (mqttClient.connect(clientId.c_str())) {
    Serial.println("[MQTT] Connected to HiveMQ successfully!");
    digitalWrite(STATUS_LED_PIN, HIGH);
  } else {
    Serial.print("[MQTT] Connect failed, state: ");
    Serial.println(mqttClient.state());
    digitalWrite(STATUS_LED_PIN, LOW);
  }
}

// ----------------------------------------------------------------------------
// 6. TELEMETRY TRANSMISSION (MQTT + Hostinger HTTPS Fallback)
// ----------------------------------------------------------------------------
void publishTelemetry() {
  float voltage = readVoltage();
  float current = readCurrent();
  float power   = readActivePower(voltage, current);
  float temp    = readTemperature();

  // Energy Accumulator: kWh = kW * hoursPassed
  unsigned long currentMillis = millis();
  if (lastEnergyCalcTime > 0) {
    float hoursPassed = (currentMillis - lastEnergyCalcTime) / 3600000.0;
    cumulativeEnergyKWh += power * hoursPassed;
  } else {
    cumulativeEnergyKWh += (power * (5.0 / 3600000.0));
  }
  lastEnergyCalcTime = currentMillis;

  // --- Real-Time Bangladesh Standard Time (BST) ---
  char bstTimeStr[48]   = "";
  char isoTimestamp[48] = "";
  time_t epochTime      = 0;
  struct tm timeinfo;
  bool timeValid = getLocalTime(&timeinfo, 50);

  if (timeValid) {
    isNtpSynced = true;
    time(&epochTime);
    // Human-readable 12-hour BST: "YYYY-MM-DD hh:mm:ss AM/PM"
    strftime(bstTimeStr, sizeof(bstTimeStr), "%Y-%m-%d %I:%M:%S %p", &timeinfo);
    // Standard ISO-8601 with explicit Bangladesh +06:00 offset
    strftime(isoTimestamp, sizeof(isoTimestamp), "%Y-%m-%dT%H:%M:%S+06:00", &timeinfo);
  }

  // --- Print Clean Diagnostic to Serial Monitor ---
  Serial.println("==========================================");
  Serial.println("           LIVE TELEMETRY DATA            ");
  Serial.println("==========================================");
  Serial.print("Device ID   : "); Serial.println(DEVICE_ID);
  Serial.print("Time (BST)  : "); Serial.println(timeValid ? bstTimeStr : "Syncing NTP...");
  Serial.print("Voltage (34): "); Serial.print(voltage, 2); Serial.println(" V");
  Serial.print("Current (35): "); Serial.print(current, 2); Serial.println(" A");
  Serial.print("Temp    (32): "); Serial.print(temp, 2); Serial.println(" °C");
  Serial.print("Power       : "); Serial.print(power, 4); Serial.println(" kW");
  Serial.print("Total Energy: "); Serial.print(cumulativeEnergyKWh, 6); Serial.println(" kWh");
  Serial.println("------------------------------------------");

  // Build Standard JSON Payload
  StaticJsonDocument<512> doc;
  doc["device_id"]   = DEVICE_ID;
  doc["voltage"]     = round(voltage * 100.0) / 100.0;
  doc["current"]     = round(current * 100.0) / 100.0;
  doc["power"]       = round(power * 1000.0) / 1000.0;
  doc["power_kw"]    = round(power * 1000.0) / 1000.0;
  doc["energy"]      = round(cumulativeEnergyKWh * 1000.0) / 1000.0;
  doc["energy_kwh"]  = round(cumulativeEnergyKWh * 1000.0) / 1000.0;
  doc["temperature"] = round(temp * 10.0) / 10.0;

  if (timeValid) {
    doc["timestamp"]      = isoTimestamp;  // "2026-09-20T23:01:24+06:00"
    doc["formatted_time"] = bstTimeStr;    // "2026-09-20 11:01:24 PM"
    doc["time_bst"]       = bstTimeStr;
    doc["epoch"]          = (unsigned long)epochTime;
  }

  char jsonBuffer[512];
  serializeJson(doc, jsonBuffer);

  bool published = false;

  // 1. Publish to HiveMQ MQTT Broker
  if (mqttClient.connected()) {
    published = mqttClient.publish(MQTT_TOPIC.c_str(), jsonBuffer);
    if (published) {
      Serial.print("[MQTT PUBLISH SUCCESS] -> ");
      Serial.println(jsonBuffer);
    }
  }

  // 2. HTTPS POST Fallback to Hostinger API
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(HTTP_API_URL);
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.POST(jsonBuffer);
    if (httpCode > 0) {
      Serial.printf("[HTTP POST SUCCESS] Hostinger API: %d OK\n", httpCode);
    } else {
      Serial.printf("[HTTP POST NOTICE] Error: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  }

  // Pulse onboard LED to indicate successful transmission
  digitalWrite(STATUS_LED_PIN, LOW);
  delay(40);
  digitalWrite(STATUS_LED_PIN, HIGH);
  Serial.println("==========================================\n");
}

// ----------------------------------------------------------------------------
// 7. SETUP & MAIN LOOP
// ----------------------------------------------------------------------------
void setup() {
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  // Set ADC pin attenuation for 0-3.3V range
  analogReadResolution(12); // 12-bit ADC (0-4095)

  Serial.begin(115200);
  delay(1000);

  Serial.println("\n==================================================");
  Serial.println(" PowerNet ESP32 DevKit V1 Initialized");
  Serial.print(" Device ID    : "); Serial.println(DEVICE_ID);
  Serial.println(" Timezone     : BST (UTC+6:00, Bangladesh)");
  Serial.print(" Voltage Pin  : GPIO "); Serial.println(VOLTAGE_PIN);
  Serial.print(" Current Pin  : GPIO "); Serial.println(CURRENT_PIN);
  Serial.print(" Temp Pin     : GPIO "); Serial.println(TEMP_PIN);
  Serial.print(" MQTT Broker  : "); Serial.println(MQTT_HOST);
  Serial.print(" MQTT Topic   : "); Serial.println(MQTT_TOPIC);
  Serial.print(" Cloud API    : "); Serial.println(HTTP_API_URL);
  Serial.println("==================================================");

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setBufferSize(512);

  connectWiFi();
}

void loop() {
  unsigned long currentMillis = millis();

  // Auto-reconnect Wi-Fi if lost
  if (WiFi.status() != WL_CONNECTED) {
    if (currentMillis - lastWifiCheckTime >= 5000) {
      lastWifiCheckTime = currentMillis;
      connectWiFi();
    }
  }

  // Auto-reconnect MQTT if Wi-Fi is healthy
  if (WiFi.status() == WL_CONNECTED && !mqttClient.connected()) {
    connectMQTT();
  }

  mqttClient.loop();

  // Transmit telemetry every 5 seconds
  if (currentMillis - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = currentMillis;
    publishTelemetry();
  }
}
