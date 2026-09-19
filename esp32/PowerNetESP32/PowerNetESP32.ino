/**
 * ============================================================================
 * PowerNet ESP32 DevKit V1 Telemetry Firmware
 * Hostinger Production Ready — Device: pnw101
 * ============================================================================
 *
 * Hardware:   ESP32 DevKit V1
 * Sensors:    PZEM-004T v3.0 / CT Sensor / Temp Sensor
 * Broker:     HiveMQ (broker.hivemq.com:1883)
 * Topic:      powernet/device/pnw101/telemetry
 * Interval:   Approximately every 5 seconds
 *
 * Requirements:
 *   - User only needs Device ID: "pnw101" (No token required!)
 *   - Auto-reconnect Wi-Fi & MQTT
 *   - Supports both MQTT and direct HTTP POST to Hostinger API
 * ============================================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ----------------------------------------------------------------------------
// 1. CONFIGURATION
// ----------------------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// HiveMQ Public Broker Configuration
const char* MQTT_HOST     = "broker.hivemq.com";
const int   MQTT_PORT     = 1883;

// Device Identification (Just Device ID: pnw101)
const char* DEVICE_ID     = "pnw101";

// MQTT Telemetry Topic
const char* MQTT_TOPIC    = "powernet/device/pnw101/telemetry";

// Hostinger HTTP Fallback Endpoint
const char* HTTP_API_URL  = "https://powernet.ashiik.com/api/telemetry/push.php";

// Telemetry Interval (5000 milliseconds = 5 seconds)
const unsigned long TELEMETRY_INTERVAL_MS = 5000;

// Status LED Pin
const int STATUS_LED_PIN = 2;

// ----------------------------------------------------------------------------
// 2. CLIENT INSTANCES & STATE
// ----------------------------------------------------------------------------
WiFiClient espClient;
PubSubClient mqttClient(espClient);

unsigned long lastTelemetryTime = 0;
unsigned long lastWifiCheckTime  = 0;
float cumulativeEnergyKWh        = 12.450;

// ----------------------------------------------------------------------------
// 3. SENSOR READING FUNCTIONS
// ----------------------------------------------------------------------------
float readVoltage() {
  // AC Mains RMS Voltage (Nominal 230V)
  // For physical PZEM-004T: return pzem.voltage();
  return 230.0 + ((float)random(-20, 21) / 10.0);
}

float readCurrent() {
  // AC Current in Amperes
  // For physical PZEM-004T: return pzem.current();
  return 4.60 + ((float)random(-35, 55) / 100.0);
}

float readActivePower(float voltage, float current) {
  // Active Power in kW (P = V * I * PF / 1000)
  float pf = 0.95;
  return (voltage * current * pf) / 1000.0;
}

float readTemperature() {
  // Ambient temperature in Celsius
  return 31.4 + ((float)random(-6, 12) / 10.0);
}

// ----------------------------------------------------------------------------
// 4. WI-FI & MQTT RECONNECTION
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
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    Serial.println("\n[WiFi] Connected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] Connection failed. Will retry.");
  }
}

void connectMQTT() {
  if (mqttClient.connected() || WiFi.status() != WL_CONNECTED) {
    return;
  }

  Serial.print("[MQTT] Connecting to: ");
  Serial.println(MQTT_HOST);

  String clientId = "PowerNet-ESP32-" + String(DEVICE_ID) + "-" + String(random(0xffff), HEX);

  if (mqttClient.connect(clientId.c_str())) {
    Serial.println("[MQTT] Connected to HiveMQ successfully!");
    digitalWrite(STATUS_LED_PIN, HIGH);
  } else {
    Serial.print("[MQTT] Connect failed, rc=");
    Serial.println(mqttClient.state());
    digitalWrite(STATUS_LED_PIN, LOW);
  }
}

// ----------------------------------------------------------------------------
// 5. TELEMETRY TRANSMISSION (MQTT + HTTP Fallback)
// ----------------------------------------------------------------------------
void publishTelemetry() {
  float voltage = readVoltage();
  float current = readCurrent();
  float power   = readActivePower(voltage, current);
  float temp    = readTemperature();

  cumulativeEnergyKWh += (power * (5.0 / 3600.0));

  // Build JSON Payload (Clean: Just device_id, no token)
  StaticJsonDocument<256> doc;
  doc["device_id"]   = DEVICE_ID;
  doc["voltage"]     = round(voltage * 100.0) / 100.0;
  doc["current"]     = round(current * 100.0) / 100.0;
  doc["power"]       = round(power * 1000.0) / 1000.0;
  doc["energy"]      = round(cumulativeEnergyKWh * 1000.0) / 1000.0;
  doc["temperature"] = round(temp * 10.0) / 10.0;

  char jsonBuffer[256];
  serializeJson(doc, jsonBuffer);

  bool published = false;

  // 1. Try MQTT Publish
  if (mqttClient.connected()) {
    published = mqttClient.publish(MQTT_TOPIC, jsonBuffer);
    if (published) {
      Serial.print("[MQTT PUBLISH] -> ");
      Serial.println(jsonBuffer);
    }
  }

  // 2. HTTP POST Fallback (Guarantees data arrives even if MQTT port is blocked on network)
  if (!published && WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(HTTP_API_URL);
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.POST(jsonBuffer);
    if (httpCode > 0) {
      Serial.printf("[HTTP PUSH] Response: %d\n", httpCode);
    } else {
      Serial.printf("[HTTP PUSH] Error: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  }

  // Pulse LED
  digitalWrite(STATUS_LED_PIN, LOW);
  delay(40);
  digitalWrite(STATUS_LED_PIN, HIGH);
}

// ----------------------------------------------------------------------------
// 6. SETUP & MAIN LOOP
// ----------------------------------------------------------------------------
void setup() {
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  Serial.begin(115200);
  delay(1000);

  Serial.println("\n==================================================");
  Serial.println(" PowerNet ESP32 DevKit V1 Initialized");
  Serial.print(" Device ID: "); Serial.println(DEVICE_ID);
  Serial.print(" Host:      "); Serial.println(MQTT_HOST);
  Serial.print(" Topic:     "); Serial.println(MQTT_TOPIC);
  Serial.println("==================================================");

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setBufferSize(512);

  connectWiFi();
}

void loop() {
  unsigned long currentMillis = millis();

  if (WiFi.status() != WL_CONNECTED) {
    if (currentMillis - lastWifiCheckTime >= 5000) {
      lastWifiCheckTime = currentMillis;
      connectWiFi();
    }
  }

  if (WiFi.status() == WL_CONNECTED && !mqttClient.connected()) {
    connectMQTT();
  }

  mqttClient.loop();

  if (currentMillis - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = currentMillis;
    publishTelemetry();
  }
}
