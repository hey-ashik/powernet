<?php
/**
 * PowerNet Standalone MQTT Ingestion Worker
 * Connects to HiveMQ MQTT Broker (broker.hivemq.com:1883)
 * Subscribes to: powernet/device/+/telemetry
 * Validates payload and ingests into MySQL telemetry database
 *
 * Usage:
 *   php subscriber.php
 */

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config/env.php';
require_once dirname(__DIR__, 2) . '/database/connection.php';
require_once dirname(__DIR__, 2) . '/services/TelemetryService.php';

use PowerNet\Config\Env;
use PowerNet\Services\TelemetryService;

Env::load();

$host = Env::get('MQTT_HOST', 'broker.hivemq.com');
$port = (int) Env::get('MQTT_PORT', 1883);
$topic = 'powernet/device/+/telemetry';
$clientId = 'PowerNet-Worker-' . bin2hex(random_bytes(4));

echo "========================================================\n";
echo " PowerNet MQTT Telemetry Ingestion Worker\n";
echo " Broker: {$host}:{$port}\n";
echo " Topic:  {$topic}\n";
echo " Client: {$clientId}\n";
echo "========================================================\n";

/**
 * Lightweight, self-contained MQTT 3.1.1 Client using PHP Sockets
 * (Follows Ponytail principles: native sockets, zero heavy dependencies)
 */
class SimpleMqttClient
{
    private $socket = null;
    private string $host;
    private int $port;
    private string $clientId;

    public function __construct(string $host, int $port, string $clientId)
    {
        $this->host = $host;
        $this->port = $port;
        $this->clientId = $clientId;
    }

    public function connect(): bool
    {
        echo "[INFO] Connecting to MQTT broker {$this->host}:{$this->port}...\n";
        $errno = 0;
        $errstr = '';
        $this->socket = @fsockopen($this->host, $this->port, $errno, $errstr, 15);

        if (!$this->socket) {
            echo "[ERROR] Failed to connect: {$errstr} ({$errno})\n";
            return false;
        }

        stream_set_timeout($this->socket, 10);

        // MQTT CONNECT packet
        $protocolName = "MQTT";
        $protocolLevel = 0x04; // 3.1.1
        $connectFlags = 0x02; // Clean Session
        $keepAlive = 60;

        $variableHeader = pack('n', strlen($protocolName)) . $protocolName
            . chr($protocolLevel)
            . chr($connectFlags)
            . pack('n', $keepAlive);

        $payload = pack('n', strlen($this->clientId)) . $this->clientId;

        $body = $variableHeader . $payload;
        $fixedHeader = chr(0x10) . self::encodeLength(strlen($body));

        fwrite($this->socket, $fixedHeader . $body);

        // Read CONNACK (4 bytes)
        $resp = fread($this->socket, 4);
        if (!$resp || ord($resp[0]) !== 0x20 || ord($resp[3]) !== 0x00) {
            echo "[ERROR] MQTT Connection rejected by broker.\n";
            fclose($this->socket);
            $this->socket = null;
            return false;
        }

        echo "[INFO] Connected successfully to HiveMQ!\n";
        return true;
    }

    public function subscribe(string $topic): bool
    {
        if (!$this->socket) {
            return false;
        }

        $packetId = 1;
        $variableHeader = pack('n', $packetId);
        $payload = pack('n', strlen($topic)) . $topic . chr(0x00); // QoS 0

        $body = $variableHeader . $payload;
        $fixedHeader = chr(0x82) . self::encodeLength(strlen($body));

        fwrite($this->socket, $fixedHeader . $body);

        // Read SUBACK
        $resp = fread($this->socket, 5);
        if (!$resp || ord($resp[0]) !== 0x90) {
            echo "[ERROR] Subscription to '{$topic}' failed.\n";
            return false;
        }

        echo "[INFO] Subscribed to topic: {$topic}\n";
        return true;
    }

    public function listen(callable $onMessage): void
    {
        $lastPing = time();

        while ($this->socket && !feof($this->socket)) {
            stream_set_timeout($this->socket, 1);
            $byte = @fread($this->socket, 1);

            if ($byte === false || $byte === '') {
                // Check if ping is due (every 30s)
                if (time() - $lastPing >= 30) {
                    @fwrite($this->socket, chr(0xC0) . chr(0x00)); // PINGREQ
                    $lastPing = time();
                }
                continue;
            }

            $cmd = ord($byte);
            $type = $cmd >> 4;

            // Ping response
            if ($type === 13) {
                // PINGRESP
                @fread($this->socket, 1);
                continue;
            }

            // PUBLISH packet received (type 3)
            if ($type === 3) {
                $remLen = self::decodeLength($this->socket);
                $packet = fread($this->socket, $remLen);

                $topicLen = (ord($packet[0]) << 8) | ord($packet[1]);
                $receivedTopic = substr($packet, 2, $topicLen);
                $messagePayload = substr($packet, 2 + $topicLen);

                $onMessage($receivedTopic, $messagePayload);
            }
        }
    }

    private static function encodeLength(int $length): string
    {
        $out = '';
        do {
            $digit = $length % 128;
            $length = (int)($length / 128);
            if ($length > 0) {
                $digit |= 0x80;
            }
            $out .= chr($digit);
        } while ($length > 0);
        return $out;
    }

    private static function decodeLength($socket): int
    {
        $multiplier = 1;
        $value = 0;
        do {
            $byte = ord(fread($socket, 1));
            $value += ($byte & 127) * $multiplier;
            $multiplier *= 128;
        } while (($byte & 128) != 0);
        return $value;
    }
}

// Worker Run Loop with automatic reconnection
while (true) {
    try {
        $client = new SimpleMqttClient($host, $port, $clientId);
        if ($client->connect()) {
            $client->subscribe($topic);
            echo "[INFO] Listening for incoming telemetry packets...\n";

            $client->listen(function (string $receivedTopic, string $message) {
                echo "[RECV] Topic: {$receivedTopic}\n";
                echo "       Payload: {$message}\n";

                $data = json_decode($message, true);
                if (!is_array($data)) {
                    echo "       [WARN] Malformed JSON rejected.\n";
                    return;
                }

                try {
                    $result = TelemetryService::ingestMqttTelemetry($data);
                    echo "       [OK] Telemetry stored: Device={$result['device_id']}, RecordedAt={$result['timestamp']}\n";
                } catch (Exception $e) {
                    echo "       [FAIL] Ingestion error: " . $e->getMessage() . "\n";
                }
            });
        }
    } catch (Throwable $e) {
        echo "[ERROR] Worker exception: " . $e->getMessage() . "\n";
    }

    echo "[WARN] Connection lost. Reconnecting in 5 seconds...\n";
    sleep(5);
}
