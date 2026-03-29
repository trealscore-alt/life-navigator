import { useState, useCallback, useRef, useEffect } from 'react';
import { BleClient, ScanResult, numberToUUID } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

// Standard BLE GATT Service/Characteristic UUIDs
const HEART_RATE_SERVICE = numberToUUID(0x180d);
const HEART_RATE_MEASUREMENT = numberToUUID(0x2a37);
const BATTERY_SERVICE = numberToUUID(0x180f);
const BATTERY_LEVEL = numberToUUID(0x2a19);
const HEALTH_THERMOMETER_SERVICE = numberToUUID(0x1809);
const TEMPERATURE_MEASUREMENT = numberToUUID(0x2a1c);
const BLOOD_PRESSURE_SERVICE = numberToUUID(0x1810);
const BLOOD_PRESSURE_MEASUREMENT = numberToUUID(0x2a35);

export interface BluetoothDevice {
  deviceId: string;
  name: string | null;
  rssi: number | null;
  connected: boolean;
  services: string[];
  lastSeen: Date;
}

export interface DeviceReading {
  deviceId: string;
  deviceName: string | null;
  dataType: string;
  value: number;
  unit: string;
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

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  const initialize = useCallback(async () => {
    try {
      setError(null);
      await BleClient.initialize({ androidNeverForLocation: true });
      setInitialized(true);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize Bluetooth');
    }
  }, []);

  const addReading = useCallback((reading: DeviceReading) => {
    setLiveReadings(prev => {
      const updated = [reading, ...prev].slice(0, 200); // keep last 200
      return updated;
    });
  }, []);

  const parseHeartRate = (value: DataView): number => {
    const flags = value.getUint8(0);
    if (flags & 0x01) {
      return value.getUint16(1, true);
    }
    return value.getUint8(1);
  };

  const parseTemperature = (value: DataView): number => {
    // IEEE 11073 FLOAT format
    const mantissa = value.getUint8(1) | (value.getUint8(2) << 8) | (value.getUint8(3) << 16);
    const exponent = value.getInt8(3) >> 4;
    return mantissa * Math.pow(10, exponent);
  };

  const startMonitoring = useCallback(async (deviceId: string) => {
    const device = devices.find(d => d.deviceId === deviceId);
    if (!device?.connected) return;

    setMonitoring(prev => new Set([...prev, deviceId]));

    try {
      const services = await BleClient.getServices(deviceId);
      const serviceUuids = services.map(s => s.uuid.toLowerCase());

      // Heart Rate
      if (serviceUuids.includes(HEART_RATE_SERVICE.toLowerCase())) {
        await BleClient.startNotifications(deviceId, HEART_RATE_SERVICE, HEART_RATE_MEASUREMENT, (value) => {
          const hr = parseHeartRate(value);
          addReading({
            deviceId,
            deviceName: device.name,
            dataType: 'heart_rate',
            value: hr,
            unit: 'bpm',
            timestamp: new Date(),
          });
        });
      }

      // Battery
      if (serviceUuids.includes(BATTERY_SERVICE.toLowerCase())) {
        try {
          const batteryVal = await BleClient.read(deviceId, BATTERY_SERVICE, BATTERY_LEVEL);
          const level = batteryVal.getUint8(0);
          addReading({
            deviceId,
            deviceName: device.name,
            dataType: 'battery',
            value: level,
            unit: '%',
            timestamp: new Date(),
          });
        } catch { /* not all devices support battery read */ }
      }

      // Temperature
      if (serviceUuids.includes(HEALTH_THERMOMETER_SERVICE.toLowerCase())) {
        await BleClient.startNotifications(deviceId, HEALTH_THERMOMETER_SERVICE, TEMPERATURE_MEASUREMENT, (value) => {
          const temp = parseTemperature(value);
          addReading({
            deviceId,
            deviceName: device.name,
            dataType: 'temperature',
            value: Math.round(temp * 10) / 10,
            unit: '°C',
            timestamp: new Date(),
          });
        });
      }

      // Blood Pressure
      if (serviceUuids.includes(BLOOD_PRESSURE_SERVICE.toLowerCase())) {
        await BleClient.startNotifications(deviceId, BLOOD_PRESSURE_SERVICE, BLOOD_PRESSURE_MEASUREMENT, (value) => {
          const systolic = value.getUint16(1, true);
          const diastolic = value.getUint16(3, true);
          addReading({
            deviceId,
            deviceName: device.name,
            dataType: 'blood_pressure_systolic',
            value: systolic,
            unit: 'mmHg',
            timestamp: new Date(),
            metadata: { diastolic },
          });
          addReading({
            deviceId,
            deviceName: device.name,
            dataType: 'blood_pressure_diastolic',
            value: diastolic,
            unit: 'mmHg',
            timestamp: new Date(),
          });
        });
      }
    } catch (err: any) {
      setError(`Monitoring failed: ${err.message}`);
      setMonitoring(prev => {
        const next = new Set(prev);
        next.delete(deviceId);
        return next;
      });
    }
  }, [devices, addReading]);

  const stopMonitoring = useCallback(async (deviceId: string) => {
    try {
      const services = await BleClient.getServices(deviceId);
      const serviceUuids = services.map(s => s.uuid.toLowerCase());

      if (serviceUuids.includes(HEART_RATE_SERVICE.toLowerCase())) {
        await BleClient.stopNotifications(deviceId, HEART_RATE_SERVICE, HEART_RATE_MEASUREMENT);
      }
      if (serviceUuids.includes(HEALTH_THERMOMETER_SERVICE.toLowerCase())) {
        await BleClient.stopNotifications(deviceId, HEALTH_THERMOMETER_SERVICE, TEMPERATURE_MEASUREMENT);
      }
      if (serviceUuids.includes(BLOOD_PRESSURE_SERVICE.toLowerCase())) {
        await BleClient.stopNotifications(deviceId, BLOOD_PRESSURE_SERVICE, BLOOD_PRESSURE_MEASUREMENT);
      }
    } catch { /* ignore */ }

    setMonitoring(prev => {
      const next = new Set(prev);
      next.delete(deviceId);
      return next;
    });
  }, []);

  const startScan = useCallback(async (durationMs = 10000) => {
    if (!initialized) await initialize();
    setScanning(true);
    setError(null);

    try {
      const enabled = await BleClient.isEnabled();
      if (!enabled) {
        setError('Bluetooth is turned off. Please enable it in your device settings.');
        setScanning(false);
        return;
      }

      await BleClient.requestLEScan({}, (result: ScanResult) => {
        setDevices(prev => {
          const existing = prev.findIndex(d => d.deviceId === result.device.deviceId);
          const device: BluetoothDevice = {
            deviceId: result.device.deviceId,
            name: result.device.name || result.localName || null,
            rssi: result.rssi ?? null,
            connected: false,
            services: result.uuids || [],
            lastSeen: new Date(),
          };
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = { ...updated[existing], ...device, connected: updated[existing].connected };
            return updated;
          }
          return [...prev, device];
        });
      });

      scanTimeoutRef.current = setTimeout(async () => {
        await stopScan();
      }, durationMs);
    } catch (err: any) {
      setError(err.message || 'Scan failed');
      setScanning(false);
    }
  }, [initialized, initialize]);

  const stopScan = useCallback(async () => {
    try { await BleClient.stopLEScan(); } catch { /* already stopped */ }
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    setScanning(false);
  }, []);

  const connectDevice = useCallback(async (deviceId: string) => {
    try {
      setError(null);
      await BleClient.connect(deviceId, () => {
        setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, connected: false } : d));
        setMonitoring(prev => {
          const next = new Set(prev);
          next.delete(deviceId);
          return next;
        });
      });
      setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, connected: true } : d));

      const services = await BleClient.getServices(deviceId);
      setDevices(prev => prev.map(d =>
        d.deviceId === deviceId ? { ...d, services: services.map(s => s.uuid) } : d
      ));
    } catch (err: any) {
      setError(`Connect failed: ${err.message}`);
    }
  }, []);

  const disconnectDevice = useCallback(async (deviceId: string) => {
    try {
      if (monitoring.has(deviceId)) await stopMonitoring(deviceId);
      await BleClient.disconnect(deviceId);
      setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, connected: false } : d));
    } catch (err: any) {
      setError(`Disconnect failed: ${err.message}`);
    }
  }, [monitoring, stopMonitoring]);

  return {
    devices,
    scanning,
    initialized,
    error,
    isNative,
    liveReadings,
    monitoring,
    initialize,
    startScan,
    stopScan,
    connectDevice,
    disconnectDevice,
    startMonitoring,
    stopMonitoring,
  };
}
