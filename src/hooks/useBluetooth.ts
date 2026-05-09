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

interface WebBluetoothRemoteGATTServer {
  connected: boolean;
  connect: () => Promise<WebBluetoothRemoteGATTServer>;
  disconnect: () => void;
  getPrimaryServices?: () => Promise<Array<{ uuid: string }>>;
}

interface WebBluetoothDevice {
  id: string;
  name?: string;
  gatt?: WebBluetoothRemoteGATTServer;
  addEventListener?: (type: 'gattserverdisconnected', listener: () => void) => void;
}

interface WebBluetoothNavigator extends Navigator {
  bluetooth?: {
    requestDevice: (options: { acceptAllDevices: boolean; optionalServices?: string[] }) => Promise<WebBluetoothDevice>;
  };
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
  const webDevicesRef = useRef<Map<string, WebBluetoothDevice>>(new Map());

  useEffect(() => { setIsNative(Capacitor.isNativePlatform()); }, []);

  const hasWebBluetooth = typeof navigator !== 'undefined' && Boolean((navigator as WebBluetoothNavigator).bluetooth);

  const initialize = useCallback(async () => {
    try {
      setError(null);
      if (isNative) {
        await BleClient.initialize({ androidNeverForLocation: true });
      }
      // Web Bluetooth doesn't need initialization
      setInitialized(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize Bluetooth');
    }
  }, [isNative]);

  const addReading = useCallback((reading: DeviceReading) => {
    setLiveReadings(prev => [reading, ...prev].slice(0, 500));
  }, []);

  const startMonitoring = useCallback(async (deviceId: string) => {
    const device = devices.find(d => d.deviceId === deviceId);
    if (!device?.connected) return;

    if (!isNative) {
      setError('Browser Bluetooth can connect to selected devices, but live monitoring requires the native CLRK app or Device Mesh runtime.');
      return;
    }

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
    } catch (err) {
      setError(`Monitoring failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setMonitoring(prev => { const n = new Set(prev); n.delete(deviceId); return n; });
    }
  }, [devices, addReading, isNative]);

  const stopMonitoring = useCallback(async (deviceId: string) => {
    const toRemove = activeNotificationsRef.current.filter(n => n.deviceId === deviceId);
    for (const n of toRemove) {
      try { await BleClient.stopNotifications(n.deviceId, n.service, n.characteristic); } catch { /* ok */ }
    }
    activeNotificationsRef.current = activeNotificationsRef.current.filter(n => n.deviceId !== deviceId);
    setMonitoring(prev => { const n = new Set(prev); n.delete(deviceId); return n; });
  }, []);

  const webBluetoothScan = useCallback(async () => {
    if (!hasWebBluetooth) {
      setError('Bluetooth is not supported in this browser.');
      setScanning(false);
      return;
    }
    try {
      // Web Bluetooth uses requestDevice (user picks from browser dialog)
      const bt = (navigator as WebBluetoothNavigator).bluetooth;
      if (!bt) throw new Error('Bluetooth is not supported in this browser.');
      const device = await bt.requestDevice({
        acceptAllDevices: true,
        optionalServices: Object.keys(KNOWN_SERVICES).map(k => k.toLowerCase()),
      });
      webDevicesRef.current.set(device.id, device);
      const newDevice: BluetoothDevice = {
        deviceId: device.id,
        name: device.name || null,
        rssi: null,
        connected: false,
        services: [],
        serviceNames: [],
        lastSeen: new Date(),
      };
      setDevices(prev => {
        const existing = prev.findIndex(d => d.deviceId === device.id);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = { ...updated[existing], ...newDevice };
          return updated;
        }
        return [...prev, newDevice];
      });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'NotFoundError')) { // user cancelled
        setError(err instanceof Error ? err.message : 'Scan failed');
      }
    }
    setScanning(false);
  }, [hasWebBluetooth]);

  const startScan = useCallback(async (durationMs = 10000) => {
    if (!initialized) await initialize();
    setScanning(true);
    setError(null);

    // Use Web Bluetooth API for browsers, Capacitor BLE for native
    if (!isNative) {
      await webBluetoothScan();
      return;
    }

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

      scanTimeoutRef.current = setTimeout(async () => {
        try { await BleClient.stopLEScan(); } catch { /* ok */ }
        scanTimeoutRef.current = null;
        setScanning(false);
      }, durationMs);
    } catch (err) { setError(err instanceof Error ? err.message : 'Scan failed'); setScanning(false); }
  }, [initialized, initialize, isNative, webBluetoothScan]);

  const stopScan = useCallback(async () => {
    try { await BleClient.stopLEScan(); } catch { /* ok */ }
    if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
    setScanning(false);
  }, []);

  const connectDevice = useCallback(async (deviceId: string) => {
    try {
      setError(null);
      if (!isNative) {
        const webDevice = webDevicesRef.current.get(deviceId);
        if (!webDevice?.gatt) throw new Error('Select this device again with Scan before connecting.');
        const server = await webDevice.gatt.connect();
        webDevice.addEventListener?.('gattserverdisconnected', () => {
          setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, connected: false } : d));
          setMonitoring(prev => { const n = new Set(prev); n.delete(deviceId); return n; });
        });
        const services = server.getPrimaryServices ? await server.getPrimaryServices().catch(() => []) : [];
        setDevices(prev => prev.map(d =>
          d.deviceId === deviceId
            ? {
                ...d,
                connected: server.connected,
                services: services.map(s => s.uuid),
                serviceNames: services
                  .map(s => KNOWN_SERVICES[s.uuid.toLowerCase()]?.name)
                  .filter((name): name is string => Boolean(name)),
              }
            : d
        ));
        return;
      }
      await BleClient.connect(deviceId, () => {
        setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, connected: false } : d));
        setMonitoring(prev => { const n = new Set(prev); n.delete(deviceId); return n; });
      });
      setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, connected: true } : d));
      const services = await BleClient.getServices(deviceId);
      setDevices(prev => prev.map(d =>
        d.deviceId === deviceId ? { ...d, services: services.map(s => s.uuid) } : d
      ));
    } catch (err) { setError(`Connect failed: ${err instanceof Error ? err.message : 'Unknown error'}`); }
  }, [isNative]);

  const disconnectDevice = useCallback(async (deviceId: string) => {
    try {
      if (monitoring.has(deviceId)) await stopMonitoring(deviceId);
      if (!isNative) {
        const webDevice = webDevicesRef.current.get(deviceId);
        webDevice?.gatt?.disconnect();
        setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, connected: false } : d));
        return;
      }
      await BleClient.disconnect(deviceId);
      setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, connected: false } : d));
    } catch (err) { setError(`Disconnect failed: ${err instanceof Error ? err.message : 'Unknown error'}`); }
  }, [isNative, monitoring, stopMonitoring]);

  return {
    devices, scanning, initialized, error, isNative, liveReadings, monitoring,
    initialize, startScan, stopScan, connectDevice, disconnectDevice,
    startMonitoring, stopMonitoring,
  };
}
