import { useState, useCallback, useRef, useEffect } from 'react';
import { BleClient, BleDevice, ScanResult } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

export interface BluetoothDevice {
  deviceId: string;
  name: string | null;
  rssi: number | null;
  connected: boolean;
  services: string[];
  lastSeen: Date;
}

export function useBluetooth() {
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNative, setIsNative] = useState(false);
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

  const startScan = useCallback(async (durationMs = 10000) => {
    if (!initialized) {
      await initialize();
    }
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
            services: (result.uuids || []),
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
    try {
      await BleClient.stopLEScan();
    } catch { /* already stopped */ }
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
        // On disconnect callback
        setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, connected: false } : d));
      });
      setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, connected: true } : d));

      // Discover services
      const services = await BleClient.getServices(deviceId);
      setDevices(prev => prev.map(d =>
        d.deviceId === deviceId
          ? { ...d, services: services.map(s => s.uuid) }
          : d
      ));
    } catch (err: any) {
      setError(`Connect failed: ${err.message}`);
    }
  }, []);

  const disconnectDevice = useCallback(async (deviceId: string) => {
    try {
      await BleClient.disconnect(deviceId);
      setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, connected: false } : d));
    } catch (err: any) {
      setError(`Disconnect failed: ${err.message}`);
    }
  }, []);

  return {
    devices,
    scanning,
    initialized,
    error,
    isNative,
    initialize,
    startScan,
    stopScan,
    connectDevice,
    disconnectDevice,
  };
}
