# PowerNet — Hostinger Deployment & Smart Energy Monitoring

**Monitor. Analyze. Predict.**

PowerNet is configured specifically for deployment to **Hostinger** (`powernet.ashik.com`) and connects an **ESP32 DevKit V1** (Device ID: `pnw101`) to a modern rounded energy dashboard inspired by enterprise monitoring tools.

---

## 1. Production Configuration Summary

* **Domain**: `https://powernet.ashik.com`
* **MySQL Database**: `u697802579_powernetdb`
* **Database Username**: `u697802579_powernetuser`
* **Database Host**: `localhost`
* **Default Device ID**: `pnw101` (No token required!)
* **HiveMQ Broker**: `broker.hivemq.com:1883`
* **Telemetry Topic**: `powernet/device/pnw101/telemetry`
* **Direct HTTP Fallback Endpoint**: `https://powernet.ashik.com/api/telemetry/push.php`

---

## 2. Hostinger Step-by-Step Deployment Guide

### Step 1: Upload Project Files to Hostinger
1. Log in to your **Hostinger hPanel**.
2. Go to **Websites** &rarr; `powernet.ashik.com` &rarr; **File Manager** (or connect via SFTP / FileZilla).
3. Open `public_html/`.
4. Upload the files and folders from this project into `public_html/`:
   ```text
   public_html/
   ├── .env                     <-- Pre-configured with your database credentials
   ├── .htaccess                <-- Clean URL rewrites (powernet.ashik.com/register)
   ├── assets/
   ├── backend/
   ├── frontend/
   ├── database/
   └── esp32/
   ```

### Step 2: Import Database in Hostinger phpMyAdmin
1. In Hostinger hPanel, go to **Databases** &rarr; **phpMyAdmin** and enter `u697802579_powernetdb`.
2. Click the **Import** tab at the top.
3. Choose the file [database/schema.sql](file:///c:/Users/DIU/Desktop/powernetweb/database/schema.sql) and click **Go**.
4. The schema creates the required tables (`users`, `devices`, `telemetry`, `email_verifications`, `password_resets`, `predictions`) and pre-seeds the `pnw101` device and demo account.

### Step 3: Flash the ESP32 (Device: `pnw101`)
1. Open [esp32/PowerNetESP32/PowerNetESP32.ino](file:///c:/Users/DIU/Desktop/powernetweb/esp32/PowerNetESP32/PowerNetESP32.ino) in the Arduino IDE.
2. In the configuration section:
   ```cpp
   const char* WIFI_SSID     = "YOUR_WIFI_SSID";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   const char* DEVICE_ID     = "pnw101"; // No token needed!
   ```
3. Upload to your ESP32 DevKit V1.
4. The ESP32 will immediately begin transmitting telemetry:
   - **Primary**: Publishes JSON to `broker.hivemq.com:1883` on topic `powernet/device/pnw101/telemetry`.
   - **Hostinger HTTP Fallback**: Also equipped to POST directly to `https://powernet.ashik.com/api/telemetry/push.php` if MQTT port 1883 is ever blocked on local Wi-Fi.

### Step 4: MQTT Ingestion on Hostinger

#### Option A: Direct HTTP Push (Recommended for Shared Hosting)
Hostinger shared hosting plans may stop long-running background CLI processes. The included firmware and `backend/api/telemetry/push.php` endpoint allow the ESP32 to push telemetry directly over HTTPS with zero background process management!

#### Option B: Cron Job / CLI Worker (Hostinger VPS or hPanel Cron)
If you run the MQTT subscriber daemon via SSH or Hostinger Cron Jobs:
1. In hPanel, go to **Advanced** &rarr; **Cron Jobs**.
2. Run command:
   ```bash
   /usr/bin/php /home/u697802579/domains/powernet.ashik.com/public_html/backend/mqtt/subscriber/subscriber.php
   ```

---

## 3. Testing with Simulator

To simulate live telemetry for device `pnw101` without ESP32 hardware:
```bash
php backend/mqtt/subscriber/simulate_esp32.php
```

---

## 4. Clean URLs on Hostinger

Hostinger LiteSpeed/Apache will automatically route:
* `https://powernet.ashik.com/register` &rarr; Registration page
* `https://powernet.ashik.com/login` &rarr; Login page
* `https://powernet.ashik.com/dashboard` &rarr; Live dashboard
* `https://powernet.ashik.com/devices` &rarr; Device pairing (just enter `pnw101`)
* `https://powernet.ashik.com/analytics` &rarr; Historical charts
