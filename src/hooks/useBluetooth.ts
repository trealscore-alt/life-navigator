import { useState, useCallback, useRef, useEffect } from 'react';
import { BleClient, ScanResult, numberToUUID } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

// Well-known BLE GATT services and their readable characteristics
const KNOWN_SERVICES: Record<string, { name: string; characteristics: { uuid: string; name: string; unit: string; parser: (v: DataView) => number }[] }> = {
  [numberToUUID(0x180d)]: {
    name: 'Heart Rate',
    characteristics: [{
      uuid: numberToUUID(0x2a37), name: 'heart_rate', unit: 'bpm',
      parser: (v) => (v.getUint8(0) & 0x01) ? v.getUint16(1, true) : v.getUint8(1),
    }],
  },
  [numberToUUID(0x180f)]: {
    name: 'Battery',
    characteristics: [{
      uuid: numberToUUID(0x2a19), name: 'battery', unit: '%',
      parser: (v) => v.getUint8(0),
    }],
  },
  [numberToUUID(0x1809)]: {
    name: 'Thermometer',
    characteristics: [{
      uuid: numberToUUID(0x2a1c), name: 'temperature', unit: '°C',
      parser: (v) => {
        const m = v.getUint8(1) | (v.getUint8(2) << 8) | (v.getUint8(3) << 16);
        const e = v.getInt8(3) >> 4;
        return Math.round(m * Math.pow(10, e) * 10) / 10;
      },
    }],
  },
  [numberToUUID(0x1810)]: {
    name: 'Blood Pressure',
    characteristics: [{
      uuid: numberToUUID(0x2a35), name: 'blood_pressure', unit: 'mmHg',
      parser: (v) => v.getUint16(1, true),
    }],
  },
  [numberToUUID(0x181a)]: {
    name: 'Environment',
    characteristics: [
      { uuid: numberToUUID(0x2a6e), name: 'ambient_temperature', unit: '°C', parser: (v) => v.getInt16(0, true) / 100 },
      { uuid: numberToUUID(0x2a6f), name: 'humidity', unit: '%', parser: (v) => v.getUint16(0, true) / 100 },
      { uuid: numberToUUID(0x2a6d), name: 'pressure', unit: 'Pa', parser: (v) => v.getUint32(0, true) / 10 },
    ],
  },
  [numberToUUID(0x1816)]: {
    name: 'Cycling Speed & Cadence',
    characteristics: [{
      uuid: numberToUUID(0x2a5b), name: 'cadence', unit: 'rpm',
      parser: (v) => v.getUint16(1, true),
    }],
  },
  [numberToUUID(0x1814)]: {
    name: 'Running Speed & Cadence',
    characteristics: [{
      uuid: numberToUUID(0x2a53), name: 'running_speed', unit: 'm/s',
      parser: (v) => v.getUint16(1, true) / 256,
    }],
  },
  [numberToUUID(0x1802)]: {
    name: 'Immediate Alert',
    characteristics: [{
      uuid: numberToUUID(0x2a06), name: 'alert_level', unit: '',
      parser: (v) => v.getUint8(0),
    }],
  },
  [numberToUUID(0x1803)]: {
    name: 'Link Loss',
    characteristics: [{
      uuid: numberToUUID(0x2a06), name: 'link_loss_alert', unit: '',
      parser: (v) => v.getUint8(0),
    }],
  },
  [numberToUUID(0x1804)]: {
    name: 'Tx Power',
    characteristics: [{
      uuid: numberToUUID(0x2a07), name: 'tx_power', unit: 'dBm',
      parser: (v) => v.getInt8(0),
    }],
  },
  [numberToUUID(0x180a)]: {
    name: 'Device Information',
    characteristics: [],
  },
};

export interface BluetoothDevice {
  deviceId: string;
  name: string | null;
  rssi: number | null;
  connected: boolean;
  services: string[];
  serviceNames: string[];
  lastSeen: Date;
}

export interface DeviceReading {
  deviceId: string;
  deviceName: string | null;
  dataType: string;
  value: number;
  unit: string;
  serviceName: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export function useBluetooth() {
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNative, setIsNative] = useState(false);
  const [liveReadings, setLiveReadings] = useState<DeviceReading[]>([]);
  const [monitoring, setMonitoring] = useState<Set<string>>(new Set());
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeNotificationsRef = useRef<{ deviceId: string; service: string; characteristic: string }[]>([]);

  useEffect(() => { setIsNative(Capacitor.isNativePlatform()); }, []);

  const hasWebBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  const initialize = useCallback(async () => {
    try {
      setError(null);
      if (isNative) {
        await BleClient.initialize({ androidNeverForLocation: true });
      }
      // Web Bluetooth doesn't need initialization
      setInitialized(true);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize Bluetooth');
    }
  }, [isNative]);

  const addReading = useCallback((reading: DeviceReading) => {
    setLiveReadings(prev => [reading, ...prev].slice(0, 500));
  }, []);

  const startMonitoring = useCallback(async (deviceId: string) => {
    const device = devices.find(d => d.deviceId === deviceId);
    if (!device?.connected) return;

    setMonitoring(prev => new Set([...prev, deviceId]));

    try {
      const services = await BleClient.getServices(deviceId);
      const serviceUuids = services.map(s => s.uuid.toLowerCase());
      const serviceNames: string[] = [];

      for (const [serviceUuid, serviceInfo] of Object.entries(KNOWN_SERVICES)) {
        if (!serviceUuids.includes(serviceUuid.toLowerCase())) continue;
        serviceNames.push(serviceInfo.name);

        for (const char of serviceInfo.characteristics) {
          try {
            // Try notification first (for streaming data)
            await BleClient.startNotifications(deviceId, serviceUuid, char.uuid, (value) => {
              try {
                const parsed = char.parser(value);
                addReading({
                  deviceId,
                  deviceName: device.name,
                  dataType: char.name,
                  value: parsed,
                  unit: char.unit,
                  serviceName: serviceInfo.name,
                  timestamp: new Date(),
                });
              } catch { /* parse error, skip */ }
            });
            activeNotificationsRef.current.push({ deviceId, service: serviceUuid, characteristic: char.uuid });
          } catch {
            // Notification not supported — try a one-time read
            try {
              const val = await BleClient.read(deviceId, serviceUuid, char.uuid);
              const parsed = char.parser(val);
              addReading({
                deviceId,
                deviceName: device.name,
                dataType: char.name,
                value: parsed,
                unit: char.unit,
                serviceName: serviceInfo.name,
                timestamp: new Date(),
              });
            } catch { /* read not supported either */ }
          }
        }
      }

      // Also try reading unknown characteristics as raw bytes
      for (const svc of services) {
        const svcLower = svc.uuid.toLowerCase();
        if (Object.keys(KNOWN_SERVICES).some(k => k.toLowerCase() === svcLower)) continue;

        for (const char of svc.characteristics) {
          if (!(char.properties.read || char.properties.notify)) continue;
          try {
            const val = await BleClient.read(deviceId, svc.uuid, char.uuid);
            // Try to interpret as single numeric value
            let parsed: number;
            if (val.byteLength === 1) parsed = val.getUint8(0);
            else if (val.byteLength === 2) parsed = val.getUint16(0, true);
            else if (val.byteLength === 4) parsed = val.getFloat32(0, true);
            else continue;

            if (isFinite(parsed)) {
              addReading({
                deviceId,
                deviceName: device.name,
                dataType: `raw_${char.uuid.slice(4, 8)}`,
                value: Math.round(parsed * 100) / 100,
                unit: 'raw',
                serviceName: `Service ${svc.uuid.slice(4, 8)}`,
                timestamp: new Date(),
              });
            }
          } catch { /* skip unreadable */ }
        }
      }

      // Update device with discovered service names
      setDevices(prev => prev.map(d =>
        d.deviceId === deviceId ? { ...d, serviceNames } : d
      ));
    } catch (err: any) {
      setError(`Monitoring failed: ${err.message}`);
      setMonitoring(prev => { const n = new Set(prev); n.delete(deviceId); return n; });
    }
  }, [devices, addReading]);

  const stopMonitoring = useCallback(async (deviceId: string) => {
    const toRemove = activeNotificationsRef.current.filter(n => n.deviceId === deviceId);
    for (const n of toRemove) {
      try { await BleClient.stopNotifications(n.deviceId, n.service, n.characteristic); } catch { /* ok */ }
    }
    activeNotificationsRef.current = activeNotificationsRef.current.filter(n => n.deviceId !== deviceId);
    setMonitoring(prev => { const n = new Set(prev); n.delete(deviceId); return n; });
  }, []);

  const startScan = useCallback(async (durationMs = 10000) => {
    if (!initialized) await initialize();
    setScanning(true);
    setError(null);
    try {
      const enabled = await BleClient.isEnabled();
      if (!enabled) { setError('Bluetooth is turned off.'); setScanning(false); return; }

      await BleClient.requestLEScan({}, (result: ScanResult) => {
        setDevices(prev => {
          const existing = prev.findIndex(d => d.deviceId === result.device.deviceId);
          const device: BluetoothDevice = {
            deviceId: result.device.deviceId,
            name: result.device.name || result.localName || null,
            rssi: result.rssi ?? null,
            connected: false,
            services: result.uuids || [],
            serviceNames: [],
            lastSeen: new Date(),
          };
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = { ...updated[existing], ...device, connected: updated[existing].connected, serviceNames: updated[existing].serviceNames };
            return updated;
          }
          return [...prev, device];
        });
      });

      scanTimeoutRef.current = setTimeout(() => stopScan(), durationMs);
    } catch (err: any) { setError(err.message || 'Scan failed'); setScanning(false); }
  }, [initialized, initialize]);

  const stopScan = useCallback(async () => {
    try { await BleClient.stopLEScan(); } catch { /* ok */ }
    if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
    setScanning(false);
  }, []);

  const connectDevice = useCallback(async (deviceId: string) => {
    try {
      setError(null);
      await BleClient.connect(deviceId, () => {
        setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, connected: false } : d));
        setMonitoring(prev => { const n = new Set(prev); n.delete(deviceId); return n; });
      });
      setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, connected: true } : d));
      const services = await BleClient.getServices(deviceId);
      setDevices(prev => prev.map(d =>
        d.deviceId === deviceId ? { ...d, services: services.map(s => s.uuid) } : d
      ));
    } catch (err: any) { setError(`Connect failed: ${err.message}`); }
  }, []);

  const disconnectDevice = useCallback(async (deviceId: string) => {
    try {
      if (monitoring.has(deviceId)) await stopMonitoring(deviceId);
      await BleClient.disconnect(deviceId);
      setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, connected: false } : d));
    } catch (err: any) { setError(`Disconnect failed: ${err.message}`); }
  }, [monitoring, stopMonitoring]);

  return {
    devices, scanning, initialized, error, isNative, liveReadings, monitoring,
    initialize, startScan, stopScan, connectDevice, disconnectDevice,
    startMonitoring, stopMonitoring,
  };
}
