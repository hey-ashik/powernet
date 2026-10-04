#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ModbusMaster.h>
#include <time.h>
#include <math.h>
#include <string.h>

const char* WIFI_SSID     = "IPSE Lab";
const char* WIFI_PASSWORD = "";             
//host
const char* MQTT_HOST     = "broker.hivemq.com";
const uint16_t MQTT_PORT = 1883;
const char* DEVICE_ID     = "pnw101";
String MQTT_TOPIC = String("powernet/device/") + DEVICE_ID + "/telemetry";
const char* HTTP_API_URL = "https://powernet.ashiik.com/api/telemetry/push.php";
const char* HTTP_BEARER_TOKEN = "";
constexpr bool ENABLE_MQTT  = true;
constexpr bool ENABLE_HTTPS = true;
// Let's Encrypt roots for powernet.ashiik.com: ISRG Root X1 (valid to 2035) + ISRG Root X2 (valid to 2040)
const char* HTTPS_TRUSTED_CA_PEM = R"CERT(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIICGzCCAaGgAwIBAgIQQdKd0XLq7qeAwSxs6S+HUjAKBggqhkjOPQQDAzBPMQsw
CQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJuZXQgU2VjdXJpdHkgUmVzZWFyY2gg
R3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBYMjAeFw0yMDA5MDQwMDAwMDBaFw00
MDA5MTcxNjAwMDBaME8xCzAJBgNVBAYTAlVTMSkwJwYDVQQKEyBJbnRlcm5ldCBT
ZWN1cml0eSBSZXNlYXJjaCBHcm91cDEVMBMGA1UEAxMMSVNSRyBSb290IFgyMHYw
EAYHKoZIzj0CAQYFK4EEACIDYgAEzZvVn4CDCuwJSvMWSj5cz3es3mcFDR0HttwW
+1qLFNvicWDEukWVEYmO6gbf9yoWHKS5xcUy4APgHoIYOIvXRdgKam7mAHf7AlF9
ItgKbppbd9/w+kHsOdx1ymgHDB/qo0IwQDAOBgNVHQ8BAf8EBAMCAQYwDwYDVR0T
AQH/BAUwAwEB/zAdBgNVHQ4EFgQUfEKWrt5LSDv6kviejM9ti6lyN5UwCgYIKoZI
zj0EAwMDaAAwZQIwe3lORlCEwkSHRhtFcP9Ymd70/aTSVaYgLXTWNLxBo1BfASdW
tL4ndQavEi51mI38AjEAi/V3bNTIZargCyzuFJ0nN6T5U6VR5CmD1/iQMVtCnwr1
/q4AaOeMSQ+2b1tbFfLn
-----END CERTIFICATE-----
)CERT";
constexpr bool HTTPS_INSECURE_LAB_TEST = false;
//RS485
constexpr uint8_t  METER_SLAVE_ID = 1;        
constexpr uint32_t METER_BAUD = 19200;        
constexpr uint32_t METER_SERIAL_MODE = SERIAL_8E1;
constexpr int8_t UART_TX_PIN = 23;  
constexpr int8_t UART_RX_PIN = 24;  
constexpr int16_t MODBUS_REGISTER_OFFSET = -1;
constexpr bool SWAP_16BIT_WORDS = false;
//REGISTER MAP
constexpr bool READ_UNVERIFIED_FOR_DIAGNOSTICS = true;
constexpr bool MAP_LL_VERIFIED      = true; 
constexpr bool MAP_LN_VERIFIED      = true;
constexpr bool MAP_CURRENT_VERIFIED = true;
constexpr bool MAP_POWER_VERIFIED   = true;
constexpr bool MAP_PF_VERIFIED      = true;
constexpr bool MAP_HZ_VERIFIED      = true;
constexpr bool MAP_KWH_VERIFIED     = true;
constexpr uint16_t REG_LL      = 3020;  
constexpr uint16_t REG_LN      = 3028;  
constexpr uint16_t REG_CURRENT = 3000;  
constexpr uint16_t REG_KW      = 3054;  
constexpr uint16_t REG_PF      = 3078;  
constexpr uint16_t REG_HZ      = 3110;  
constexpr uint16_t REG_KWH     = 2700;  
//delay
constexpr uint32_t SAMPLE_EVERY_MS       = 15000;
constexpr uint32_t WIFI_RETRY_EVERY_MS   = 20000;
constexpr uint32_t MQTT_RETRY_EVERY_MS   = 10000;
constexpr uint16_t MODBUS_GROUP_GAP_MS   = 80;
constexpr uint16_t MQTT_BUFFER_BYTES     = 4096; 
constexpr long BANGLADESH_OFFSET_SECONDS = 6L * 3600L;

HardwareSerial MeterUART(1);
ModbusMaster meter;
WiFiClient mqttNetworkClient;
PubSubClient mqttClient(mqttNetworkClient);

uint32_t lastSampleAt = 0;
uint32_t lastWifiTryAt = 0;
uint32_t lastMqttTryAt = 0;
uint32_t sequenceCounter = 0;
uint32_t bootNonce = 0;
bool clockConfigured = false;

struct MeterSample {
  float ll[3], ln[3], current[3], powerKW[4], pfRaw[4];
  float hz, importedKWh;
  bool okLL, okLN, okI, okP, okPF, okHz, okKWh;
};

void initSample(MeterSample& s) {
  for (int i=0; i<3; ++i) {
    s.ll[i] = s.ln[i] = s.current[i] = NAN;
  }
  for (int i=0; i<4; ++i) {
    s.powerKW[i] = s.pfRaw[i] = NAN;
  }
  s.hz = s.importedKWh = NAN;
  s.okLL = s.okLN = s.okI = s.okP = s.okPF = s.okHz = s.okKWh = false;
}

float readSwappedFloat(uint16_t word0, uint16_t word1) {
  uint32_t bits = SWAP_16BIT_WORDS
    ? (uint32_t(word1) << 16) | word0
    : (uint32_t(word0) << 16) | word1;
  static_assert(sizeof(float) == sizeof(uint32_t), "Float32 required");
  float out;
  memcpy(&out, &bits, sizeof(out));
  return out;
}

bool inRange(float v, float lo, float hi) {
  return isfinite(v) && v >= lo && v <= hi;
}

bool readFloatBlock(const char* name, bool mappingVerified, uint16_t label,
                    uint8_t count, float* dst, float lo, float hi) {
  if (!mappingVerified && !READ_UNVERIFIED_FOR_DIAGNOSTICS) {
    Serial.printf("[MAP] %-7s disabled until verified in ModScan32\n", name);
    return false;
  }
  int32_t wireAddress = int32_t(label) + MODBUS_REGISTER_OFFSET;
  if (wireAddress < 0 || count < 1 || count > 20) return false;

  meter.clearResponseBuffer();
  uint8_t status = meter.readHoldingRegisters(uint16_t(wireAddress), count*2);
  if (status != meter.ku8MBSuccess) {
    Serial.printf("[MODBUS] %-7s label=%u wire=%ld failed 0x%02X\n",
                  name, label, (long)wireAddress, status);
    return false;
  }

  bool groupOK = mappingVerified;  
  for (uint8_t i=0; i<count; ++i) {
    uint16_t a = meter.getResponseBuffer(2*i);
    uint16_t b = meter.getResponseBuffer(2*i + 1);
    float f = readSwappedFloat(a, b);
    bool valid = inRange(f, lo, hi);
    dst[i] = (mappingVerified && valid) ? f : NAN;
    groupOK &= valid;
    Serial.printf("[%s] %-7s +%u raw=%04X %04X decoded=%.6f%s\n",
                  mappingVerified ? "MODBUS" : "CANDIDATE",
                  name, unsigned(2*i), a, b, f,
                  !valid ? "  INVALID" : (mappingVerified ? "" : "  VERIFY ON METER LCD"));
  }
  return groupOK;
}

float pf4qToIec(float raw) {
  if (!inRange(raw, -2.0f, 2.0f)) return NAN;
  if (raw > 1.0f)  return 2.0f - raw;
  if (raw < -1.0f) return -2.0f - raw;
  return raw;
}

MeterSample sampleMeter() {
  MeterSample s;
  initSample(s);
  s.okLL  = readFloatBlock("VLL", MAP_LL_VERIFIED, REG_LL, 3, s.ll, 0, 650);
  delay(MODBUS_GROUP_GAP_MS);
  s.okLN  = readFloatBlock("VLN", MAP_LN_VERIFIED, REG_LN, 3, s.ln, 0, 400);
  delay(MODBUS_GROUP_GAP_MS);
  s.okI   = readFloatBlock("AMPS", MAP_CURRENT_VERIFIED, REG_CURRENT, 3, s.current, 0, 100);
  delay(MODBUS_GROUP_GAP_MS);
  s.okP   = readFloatBlock("KW", MAP_POWER_VERIFIED, REG_KW, 4, s.powerKW, -100, 100);
  delay(MODBUS_GROUP_GAP_MS);
  s.okPF  = readFloatBlock("PF", MAP_PF_VERIFIED, REG_PF, 4, s.pfRaw, -2, 2);
  delay(MODBUS_GROUP_GAP_MS);
  s.okHz  = readFloatBlock("HZ", MAP_HZ_VERIFIED, REG_HZ, 1, &s.hz, 40, 70);
  delay(MODBUS_GROUP_GAP_MS);
  s.okKWh = readFloatBlock("KWH", MAP_KWH_VERIFIED, REG_KWH, 1, &s.importedKWh, 0, 1e9f);
  return s;
}

void addFloatOrNull(JsonArray arr, float x) {
  if (isfinite(x)) arr.add(x);
  else arr.add(nullptr);
}

void putFloatOrNull(JsonDocument& doc, const char* key, float x) {
  if (isfinite(x)) doc[key] = x;
  else doc[key] = nullptr;
}

bool isClockSynced() {
  return time(nullptr) > 1735689600;  
}

void fillTime(JsonDocument& doc) {
  doc["timestamp_synced"] = isClockSynced();
  if (!isClockSynced()) {
    doc["timestamp_utc"] = nullptr;
    doc["timestamp_bdt"] = nullptr;
    return;
  }
  time_t utc = time(nullptr);
  struct tm utcTM;
  gmtime_r(&utc, &utcTM);
  char utcText[28];
  strftime(utcText, sizeof(utcText), "%Y-%m-%dT%H:%M:%SZ", &utcTM);
  doc["timestamp_utc"] = utcText;

  time_t bdt = utc + BANGLADESH_OFFSET_SECONDS;
  struct tm bdtTM;
  gmtime_r(&bdt, &bdtTM);
  char bdtText[32];
  strftime(bdtText, sizeof(bdtText), "%Y-%m-%dT%H:%M:%S+06:00", &bdtTM);
  doc["timestamp_bdt"] = bdtText;
}

String encodeSample(const MeterSample& s) {
  JsonDocument doc;                       
  doc["schema_version"]    = 1;
  doc["device_id"]         = DEVICE_ID;
  doc["meter_model"]       = "Schneider PM2130D";
  doc["protocol"]          = "modbus_rtu";
  doc["meter_slave_id"]    = METER_SLAVE_ID;
  doc["ct_primary_a"]      = 60;
  doc["ct_secondary_a"]    = 5;
  doc["uptime_ms"]         = millis();
  doc["sample_id"]         = String(DEVICE_ID) + "-" + String(bootNonce, HEX) + "-" + String(++sequenceCounter);
  fillTime(doc);

  JsonArray ll = doc["voltage_ll_v"].to<JsonArray>(); 
  JsonArray ln = doc["voltage_ln_v"].to<JsonArray>(); 
  JsonArray ii = doc["phase_current_a"].to<JsonArray>(); 
  JsonArray pp = doc["phase_power_kw"].to<JsonArray>(); 
  JsonArray pf = doc["phase_pf_iec"].to<JsonArray>(); 
  for (uint8_t i=0; i<3; ++i) {
    addFloatOrNull(ll, s.ll[i]);
    addFloatOrNull(ln, s.ln[i]);
    addFloatOrNull(ii, s.current[i]);
    addFloatOrNull(pp, s.powerKW[i]);
    addFloatOrNull(pf, pf4qToIec(s.pfRaw[i]));
  }
  putFloatOrNull(doc, "total_power_kw", s.powerKW[3]);
  putFloatOrNull(doc, "total_pf_iec", pf4qToIec(s.pfRaw[3]));
  putFloatOrNull(doc, "frequency_hz", s.hz);
  putFloatOrNull(doc, "import_energy_kwh", s.importedKWh);

  JsonObject q = doc["quality"].to<JsonObject>();
  q["voltage_ll_ok"] = s.okLL;
  q["voltage_ln_ok"] = s.okLN;
  q["current_ok"] = s.okI;
  q["power_ok"] = s.okP;
  q["power_factor_ok"] = s.okPF;
  q["frequency_ok"] = s.okHz;
  q["kwh_ok"] = s.okKWh;
  q["partial"] = !(s.okLL && s.okLN && s.okI && s.okP && s.okPF && s.okHz && s.okKWh);

  JsonObject verified = doc["map_verified"].to<JsonObject>();
  verified["voltage_ll"] = MAP_LL_VERIFIED;
  verified["voltage_ln"] = MAP_LN_VERIFIED;
  verified["current"] = MAP_CURRENT_VERIFIED;
  verified["power"] = MAP_POWER_VERIFIED;
  verified["power_factor"] = MAP_PF_VERIFIED;
  verified["frequency"] = MAP_HZ_VERIFIED;
  verified["import_energy"] = MAP_KWH_VERIFIED;

  String json;
  serializeJson(doc, json);
  return json;
}

void onWiFiDiagnostic(WiFiEvent_t event, WiFiEventInfo_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
      Serial.println("[WIFI] Associated with access point.");
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      Serial.printf("[WIFI] Disconnected; reason=%u\n",
                    info.wifi_sta_disconnected.reason);
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      Serial.println("[WIFI] DHCP assigned an IP address.");
      break;
    default: break;
  }
}

void maintainWiFi() {
  if (strlen(WIFI_SSID) == 0) return;
  if (WiFi.status() == WL_CONNECTED) {
    if (!clockConfigured) {
      configTime(0, 0, "pool.ntp.org", "time.google.com");
      clockConfigured = true;
      Serial.printf("[WIFI] Connected, IP=%s\n", WiFi.localIP().toString().c_str());
    }
    return;
  }
  clockConfigured = false;
  if ((uint32_t)(millis() - lastWifiTryAt) >= WIFI_RETRY_EVERY_MS) {
    lastWifiTryAt = millis();
    Serial.printf("[WIFI] Waiting for core reconnect; status=%d. "
                  "No overlapping WiFi.reconnect() call.\n", int(WiFi.status()));
  }
}

void maintainMQTT() {
  if (!ENABLE_MQTT || WiFi.status() != WL_CONNECTED) return;
  if (mqttClient.connected()) {
    mqttClient.loop();
    return;
  }
  if ((uint32_t)(millis() - lastMqttTryAt) < MQTT_RETRY_EVERY_MS) return;
  lastMqttTryAt = millis();
  
  String cid = String(DEVICE_ID) + "-PM2130D-" + WiFi.macAddress();
  cid.replace(":", "");
  Serial.printf("[MQTT] Connecting to %s:%u ...\n", MQTT_HOST, MQTT_PORT);
  if (mqttClient.connect(cid.c_str())) {
    Serial.printf("[MQTT] Connected, topic=%s\n", MQTT_TOPIC.c_str());
  } else {
    Serial.printf("[MQTT] Connect failed, status=%d\n", mqttClient.state());
  }
}

bool publishMQTT(const String& json) {
  if (!ENABLE_MQTT) return false;
  if (!mqttClient.connected()) {
    Serial.println("[MQTT] Not connected; this sample not published.");
    return false;
  }
  const unsigned int needed = json.length() + MQTT_TOPIC.length() + 16;
  if (needed >= mqttClient.getBufferSize()) {
    Serial.printf("[MQTT] JSON too large: %u bytes; increase MQTT_BUFFER_BYTES\n", needed);
    return false;
  }
  bool ok = mqttClient.publish(MQTT_TOPIC.c_str(),
                      reinterpret_cast<const uint8_t*>(json.c_str()),
                      json.length(), false);
  Serial.printf("[MQTT] Publish %s (%u JSON bytes). QoS0; not server storage proof.\n",
                ok ? "OK" : "FAILED", unsigned(json.length()));
  mqttClient.loop();
  return ok;
}

bool sendHTTPS(const String& json) {
  if (!ENABLE_HTTPS || strlen(HTTP_API_URL) == 0) return false;
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTPS] Offline; this sample not uploaded.");
    return false;
  }
  if (!isClockSynced()) {
    Serial.println("[HTTPS] Waiting for NTP clock sync (certificate validation).");
    return false;
  }
  String ca = String(HTTPS_TRUSTED_CA_PEM);
  ca.trim();
  if (!HTTPS_INSECURE_LAB_TEST && !ca.startsWith("-----BEGIN CERTIFICATE-----")) {
    Serial.println("[HTTPS] Not sent: add trusted CA PEM, or choose test-only insecure mode.");
    return false;
  }
  WiFiClientSecure tls;
  if (HTTPS_INSECURE_LAB_TEST) {
    Serial.println("[HTTPS] WARNING: INSECURE test mode; server identity NOT checked!");
    tls.setInsecure();
  } else {
    tls.setCACert(HTTPS_TRUSTED_CA_PEM);
  }

  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(8000);
  if (!http.begin(tls, HTTP_API_URL)) {
    Serial.println("[HTTPS] Could not initialize HTTPS connection.");
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/json");
  if (strlen(HTTP_BEARER_TOKEN) > 0) {
    http.addHeader("Authorization", String("Bearer ") + HTTP_BEARER_TOKEN);
  }
  int status = http.POST(json);
  Serial.printf("[HTTPS] POST result=%d\n", status);
  if (status > 0) {
    String reply = http.getString();
    if (reply.length() > 450) reply = reply.substring(0, 450) + "...";
    Serial.printf("[HTTPS] Response: %s\n", reply.c_str());
  }
  http.end();
  if (status >= 200 && status < 300) {
    Serial.println("[HTTPS] Transport accepted; verify DB/dashboard and PHP response.");
    return true;
  }
  Serial.println("[HTTPS] Upload failed/rejected. Check TLS, auth, and PHP payload contract.");
  return false;
}

void setup() {
  Serial.begin(115200);
  delay(1100);
  Serial.println("\nPower.Net PM2130D ESP32-C5 MQTT + HTTPS gateway");
  Serial.println("FLOAT-FIX: MSW-first from observed ESP32 raw words; ModScan UI uses different naming.");
  Serial.println("NOTE: only VLL 3020 is confirmed; candidate groups printed but kept NULL in JSON.");
  Serial.println("NOTE: network upload is OFF while verifying actual meter readings.");
  bootNonce = esp_random();

  MeterUART.begin(METER_BAUD, METER_SERIAL_MODE, UART_RX_PIN, UART_TX_PIN);
  meter.begin(METER_SLAVE_ID, MeterUART);
  Serial.printf("[MODBUS] Slave=%u baud=%lu 8E1 TX=GPIO%d RX=GPIO%d offset=%d swap=%d\n",
                METER_SLAVE_ID, (unsigned long)METER_BAUD, UART_TX_PIN, UART_RX_PIN,
                MODBUS_REGISTER_OFFSET, SWAP_16BIT_WORDS);

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  if (!mqttClient.setBufferSize(MQTT_BUFFER_BYTES)) {
    Serial.println("[MQTT] ERROR: cannot allocate MQTT buffer!");
  }
  mqttClient.setKeepAlive(60);
  mqttClient.setSocketTimeout(4);

  WiFi.onEvent(onWiFiDiagnostic);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  if (strlen(WIFI_SSID) > 0) {
    if (strlen(WIFI_PASSWORD) == 0) {
      Serial.println("[WIFI] WARNING: password is blank. Enter your network password "
                     "unless this is intentionally an open network.");
    }
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD); 
    lastWifiTryAt = millis();
    Serial.println("[WIFI] Connecting...");
  } else {
    Serial.println("[WIFI] SSID blank, network transmission unavailable.");
  }
}

void loop() {
  maintainWiFi();
  maintainMQTT();

  static bool first = true;
  if (first || (uint32_t)(millis() - lastSampleAt) >= SAMPLE_EVERY_MS) {
    first = false;
    lastSampleAt = millis();
    Serial.println("\n================ READ PM2130D ================");
    MeterSample s = sampleMeter();
    String payload = encodeSample(s);
    Serial.printf("[JSON] %s\n", payload.c_str());

    if (!s.okLL) {
      Serial.println("[GATE] VLL failed: upload blocked (check UART, address, swapped word order).");
    } else {
      maintainMQTT();
      publishMQTT(payload);
      sendHTTPS(payload);
    }
    Serial.println("============== END SAMPLE ==================");
  }
  
  delay(30);
}