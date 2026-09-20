# PowerNet Ai Web

Smart Electrical Energy Monitoring & Predictive Intelligence Web Platform.

---

## ⚡ Quick Architecture Overview

* **Frontend**: Vanilla HTML5, CSS3, JavaScript (Glassmorphism, responsive, mobile-optimized).
* **Local Dev Server**: Zero-dependency native Node.js (`server.js`) on `http://localhost:3000`.
* **Production Server**: PHP 8.x + MySQL + Apache/LiteSpeed (`.htaccess`) on Hostinger Business Hosting (`https://powernet.ashiik.com`).
* **IoT / Telemetry**: ESP32 DevKit V1 streaming to HiveMQ MQTT (`broker.hivemq.com:1883`) with HTTPS fallback (`/api/telemetry/push.php`).
* **Mailing**: Hostinger SMTP via TLS port 465 (configured securely in `.env`).

---

## 💻 1. Local Development Setup

Run the entire application locally with zero npm dependencies or external web servers.

### Start the Local Server
```bash
node server.js
```
Open your browser at: **`http://localhost:3000`**

### Local Features & Routes
* `/login` & `/register`: User authentication with bottom-right toast notifications.
* `/dashboard`: Real-time gauges, live power/voltage charts, cost calculations, and event log.
* `/devices`: Live device pairing and database collision detection.
* `/analytics`: Historical analytics, daily kWh usage, and load distribution.
* **Email Verification & Password Reset**: Dispatches real emails via Hostinger SMTP over TLS 465. Verification links are also logged directly to the server terminal.

---

## 🌐 2. Hostinger Server Deployment Setup

Deploy to Hostinger Business Hosting with Apache/LiteSpeed and MySQL.

### Step 1: Upload Files
1. Log in to **Hostinger hPanel** &rarr; **Websites** &rarr; **File Manager** (or SFTP).
2. Open the **`public_html/`** folder.
3. Upload **`powernet.zip`** and click **Extract**, or upload the project files directly:
   ```text
   public_html/
   ├── .env                     # Production database & SMTP credentials (keep private)
   ├── .htaccess                # Clean URL rewrite rules for LiteSpeed/Apache
   ├── assets/                  # Stylesheets, JavaScript, icons
   ├── backend/                 # PHP API controllers & services
   ├── frontend/                # Dashboard, auth, and device views
   ├── database/                # MySQL schema & sample seed data
   └── esp32/                   # Arduino C++ ESP32 firmware
   ```

### Step 2: Import Database in Hostinger phpMyAdmin
1. In Hostinger hPanel, go to **Databases** &rarr; **phpMyAdmin** &rarr; select your database.
2. Click the **Import** tab at the top.
3. Choose the file **`database/schema.sql`** and click **Go**.
4. Creates all necessary tables: `users`, `devices`, `telemetry`, `email_verifications`, `password_resets`, and `predictions`.

### Step 3: Configuration (`.env`)
Configure your database and mail settings in your `.env` file:
```ini
APP_ENV=production
APP_URL=https://yourdomain.com

DB_HOST=localhost
DB_PORT=3306
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password

MAIL_HOST=smtp.hostinger.com
MAIL_PORT=465
MAIL_USERNAME=your_email@yourdomain.com
MAIL_PASSWORD=your_email_password
```

### Step 4: Production Clean URLs
Hostinger LiteSpeed/Apache automatically routes all endpoints cleanly via `.htaccess`:
* `https://powernet.ashiik.com/login`
* `https://powernet.ashiik.com/register`
* `https://powernet.ashiik.com/dashboard`
* `https://powernet.ashiik.com/devices`
* `https://powernet.ashiik.com/analytics`

---

## 🔌 3. Device Pairing Rules & Logic

PowerNet enforces a strict, secure 1-to-1 device pairing model:

1. **One Active Device Per Account**: Each user can connect exactly one active device at a time.
2. **Real-Time Collision Detection**:
   * When a user inputs a Device ID, the system queries the database.
   * If the device is already paired to another user account (`user_id IS NOT NULL`), the system rejects the connection and displays:
     > ⚠️ **"Enter Correct Device ID"**
   * If the Device ID is unclaimed or newly entered, it binds securely to the current user.
3. **Flexible Disconnect & Swap**:
   * Clicking **Disconnect** immediately unbinds the device in the database (`user_id = NULL`).
   * The user is now free to connect a different Device ID anytime, or another user can claim the released device.

---

## 📡 4. ESP32 Hardware & Telemetry Pipeline

### Flash the ESP32 Firmware
1. Open **`esp32/PowerNetESP32/PowerNetESP32.ino`** in the Arduino IDE.
2. Set your Wi-Fi credentials and Device ID:
   ```cpp
   const char* WIFI_SSID     = "YOUR_WIFI_SSID";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   const char* DEVICE_ID     = "pnw101"; // Or pnw102, pnw103, etc.
   ```
3. Upload to your **ESP32 DevKit V1**.

### Telemetry Flow
* **MQTT Ingestion (Primary)**: Publishes live JSON packets to HiveMQ:
  * Broker: `broker.hivemq.com:1883`
  * Topic: `powernet/device/<DEVICE_ID>/telemetry`
* **Direct HTTPS Push (Fallback)**: If port 1883 is blocked on local Wi-Fi, the ESP32 automatically posts directly to:
  * `https://powernet.ashiik.com/api/telemetry/push.php`
* **Software Telemetry Simulator**: To test telemetry without ESP32 hardware:
  ```bash
  php backend/mqtt/subscriber/simulate_esp32.php
  ```

---

## 📧 5. Authentication & Email Services

* **Hostinger Authenticated SMTP**: Direct SSL/TLS socket connection to `smtp.hostinger.com:465`.
* **Clean Email Templates**: Account verification and password reset emails feature modern call-to-action buttons without exposed raw tokens or messy URLs.
* **Bottom-Right Toast Notifications**: All login, register, device pairing, and reset feedback messages appear cleanly in the bottom-right corner (bottom-docked on mobile) without blocking UI components.
