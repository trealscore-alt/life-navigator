import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useBluetooth, BluetoothDevice, DeviceReading } from '@/hooks/useBluetooth';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Bluetooth, BluetoothSearching, BluetoothConnected,
  BluetoothOff, Radio, Signal, SignalLow, SignalMedium, SignalHigh,
  Smartphone, Watch, Speaker, Cpu, Monitor, Loader2, AlertTriangle,
  Power, PowerOff, Wifi, Heart, Thermometer, Activity, Battery,
  Brain, Upload,
} from 'lucide-react';

const PROCESS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-device-data`;

function getRssiIcon(rssi: number | null) {
  if (rssi === null) return Signal;
  if (rssi >= -50) return SignalHigh;
  if (rssi >= -70) return SignalMedium;
  return SignalLow;
}

function getRssiStrength(rssi: number | null): string {
  if (rssi === null) return 'Unknown';
  if (rssi >= -50) return 'Excellent';
  if (rssi >= -70) return 'Good';
  if (rssi >= -85) return 'Fair';
  return 'Weak';
}

function getDeviceIcon(name: string | null) {
  if (!name) return Cpu;
  const n = name.toLowerCase();
  if (n.includes('watch') || n.includes('band') || n.includes('fit')) return Watch;
  if (n.includes('phone') || n.includes('pixel') || n.includes('iphone') || n.includes('galaxy')) return Smartphone;
  if (n.includes('speaker') || n.includes('buds') || n.includes('airpod') || n.includes('jbl')) return Speaker;
  if (n.includes('tv') || n.includes('monitor') || n.includes('display')) return Monitor;
  return Cpu;
}

function getReadingIcon(dataType: string) {
  if (dataType.includes('heart')) return Heart;
  if (dataType.includes('temp')) return Thermometer;
  if (dataType.includes('battery')) return Battery;
  if (dataType.includes('blood')) return Activity;
  return Radio;
}

function getReadingColor(dataType: string) {
  if (dataType.includes('heart')) return 'text-red-400';
  if (dataType.includes('temp')) return 'text-orange-400';
  if (dataType.includes('battery')) return 'text-green-400';
  if (dataType.includes('blood')) return 'text-purple-400';
  return 'text-primary';
}

const DeviceHub = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    devices, scanning, error, isNative, liveReadings, monitoring,
    startScan, stopScan, connectDevice, disconnectDevice,
    startMonitoring, stopMonitoring,
  } = useBluetooth();
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<{ insight: string; alerts: string[]; goalUpdates: { goalId: string; newProgress: number }[] } | null>(null);
  const syncBufferRef = useRef<DeviceReading[]>([]);

  const connectedCount = devices.filter(d => d.connected).length;
  const monitoringCount = monitoring.size;

  // Buffer readings for batch sync
  useEffect(() => {
    if (liveReadings.length > 0) {
      const latest = liveReadings[0];
      if (!syncBufferRef.current.find(r => r.timestamp === latest.timestamp && r.dataType === latest.dataType)) {
        syncBufferRef.current.push(latest);
      }
    }
  }, [liveReadings]);

  // Auto-sync every 30 seconds if there are buffered readings
  useEffect(() => {
    const interval = setInterval(() => {
      if (syncBufferRef.current.length > 0 && user) {
        syncToCloud();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const syncToCloud = async () => {
    if (!user || syncBufferRef.current.length === 0 || syncing) return;
    setSyncing(true);

    const readings = syncBufferRef.current.map(r => ({
      deviceId: r.deviceId,
      deviceName: r.deviceName,
      dataType: r.dataType,
      value: r.value,
      unit: r.unit,
      metadata: r.metadata || {},
    }));

    syncBufferRef.current = [];

    try {
      const resp = await fetch(PROCESS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ userId: user.id, readings }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.analysis) {
          setLastAnalysis(data.analysis);
          if (data.analysis.insight) {
            toast({ title: 'CLRK Health Insight', description: data.analysis.insight });
          }
          if (data.analysis.alerts?.length > 0) {
            for (const alert of data.analysis.alerts) {
              toast({ title: '⚠️ Health Alert', description: alert, variant: 'destructive' });
            }
          }
          if (data.goalUpdates?.length > 0) {
            toast({ title: 'Goals Updated', description: `${data.goalUpdates.length} health goal(s) progressed` });
          }
        }
      }
    } catch (err: any) {
      console.error('Sync error:', err);
    }
    setSyncing(false);
  };

  const handleScan = async () => {
    if (scanning) {
      await stopScan();
    } else {
      await startScan(15000);
    }
  };

  const handleConnect = async (device: BluetoothDevice) => {
    toast({ title: `Connecting to ${device.name || 'device'}...` });
    await connectDevice(device.deviceId);
  };

  const handleDisconnect = async (device: BluetoothDevice) => {
    await disconnectDevice(device.deviceId);
    toast({ title: `Disconnected from ${device.name || 'device'}` });
  };

  const handleToggleMonitor = async (device: BluetoothDevice) => {
    if (monitoring.has(device.deviceId)) {
      await stopMonitoring(device.deviceId);
      toast({ title: `Stopped monitoring ${device.name || 'device'}` });
    } else {
      await startMonitoring(device.deviceId);
      toast({ title: `Monitoring ${device.name || 'device'}`, description: 'Reading health data...' });
    }
  };

  // Get latest reading per type per device
  const latestByType: Record<string, DeviceReading> = {};
  for (const r of liveReadings) {
    const key = `${r.deviceId}:${r.dataType}`;
    if (!latestByType[key]) latestByType[key] = r;
  }

  const sortedDevices = [...devices].sort((a, b) => {
    if (a.connected !== b.connected) return a.connected ? -1 : 1;
    return (b.rssi || -100) - (a.rssi || -100);
  });

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 grid-bg opacity-10" />

      {/* Header */}
      <header className="relative z-10 border-b border-border/50 bg-card/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <div>
              <h1 className="font-mono text-lg flex items-center gap-2">
                <Bluetooth className="w-5 h-5 text-primary" />
                <span className="neon-text">Device Hub</span>
              </h1>
              <p className="text-[10px] font-mono text-muted-foreground">
                BLE • {devices.length} discovered • {connectedCount} connected • {monitoringCount} monitoring
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {syncBufferRef.current.length > 0 && (
              <Button
                onClick={syncToCloud}
                disabled={syncing}
                variant="outline"
                className="font-mono text-xs"
              >
                {syncing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Sync ({syncBufferRef.current.length})
              </Button>
            )}
            <Button
              onClick={handleScan}
              className={`font-mono text-xs ${scanning
                ? 'bg-destructive/20 border border-destructive/30 text-destructive hover:bg-destructive/30'
                : 'bg-primary text-primary-foreground'}`}
            >
              {scanning ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Stop Scan</>
              ) : (
                <><BluetoothSearching className="w-4 h-4 mr-2" /> Scan Devices</>
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Platform Warning */}
        {!isNative && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card neon-border rounded-xl p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-mono text-sm text-yellow-400">Native Platform Required</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Bluetooth requires running as a native app via Capacitor. Export to GitHub, add iOS/Android, and run on a real device.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card rounded-xl p-4 border border-destructive/30">
            <div className="flex items-center gap-3">
              <BluetoothOff className="w-5 h-5 text-destructive" />
              <p className="text-xs font-mono text-destructive">{error}</p>
            </div>
          </motion.div>
        )}

        {/* Scan Progress */}
        {scanning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center gap-3 mb-2">
              <Radio className="w-4 h-4 text-primary animate-pulse" />
              <span className="font-mono text-xs text-primary">Scanning for nearby devices...</span>
            </div>
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
              <motion.div className="h-full bg-primary" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 15, ease: 'linear' }} />
            </div>
          </motion.div>
        )}

        {/* Live Health Data Feed */}
        {Object.keys(latestByType).length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <h3 className="font-mono text-xs text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Live Health Data
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.values(latestByType)
                .filter(r => r.dataType !== 'battery')
                .map(r => {
                  const Icon = getReadingIcon(r.dataType);
                  const color = getReadingColor(r.dataType);
                  return (
                    <motion.div
                      key={`${r.deviceId}:${r.dataType}`}
                      className="glass-card rounded-xl p-4 neon-border"
                      initial={{ scale: 0.95 }}
                      animate={{ scale: 1 }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`w-4 h-4 ${color}`} />
                        <span className="text-[10px] font-mono text-muted-foreground capitalize">
                          {r.dataType.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className={`font-mono text-2xl ${color}`}>
                        {r.value}
                        <span className="text-xs ml-1 text-muted-foreground">{r.unit}</span>
                      </p>
                      <p className="text-[9px] font-mono text-muted-foreground mt-1">
                        {r.deviceName || 'Unknown'} • {r.timestamp.toLocaleTimeString()}
                      </p>
                    </motion.div>
                  );
                })}
            </div>
          </motion.div>
        )}

        {/* CLRK Analysis */}
        {lastAnalysis && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card neon-border rounded-xl p-5">
            <h3 className="font-mono text-xs text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
              <Brain className="w-4 h-4" /> CLRK Health Analysis
            </h3>
            <p className="text-sm text-foreground/80 leading-relaxed">{lastAnalysis.insight}</p>
            {lastAnalysis.alerts?.length > 0 && (
              <div className="mt-3 space-y-1">
                {lastAnalysis.alerts.map((alert, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <AlertTriangle className="w-3 h-3 text-yellow-400" />
                    <span className="text-yellow-400">{alert}</span>
                  </div>
                ))}
              </div>
            )}
            {lastAnalysis.goalUpdates?.length > 0 && (
              <div className="mt-3 text-[10px] font-mono text-green-400">
                ✓ {lastAnalysis.goalUpdates.length} health goal(s) automatically updated
              </div>
            )}
          </motion.div>
        )}

        {/* Recent Readings Log */}
        {liveReadings.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Radio className="w-4 h-4" /> Reading Log
              <Badge variant="outline" className="text-[8px] font-mono ml-auto">{liveReadings.length} readings</Badge>
            </h3>
            <div className="glass-card rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
              {liveReadings.slice(0, 30).map((r, i) => {
                const Icon = getReadingIcon(r.dataType);
                const color = getReadingColor(r.dataType);
                return (
                  <div key={i} className="flex items-center gap-3 text-[10px] font-mono py-1 border-b border-border/20 last:border-0">
                    <Icon className={`w-3 h-3 ${color} flex-shrink-0`} />
                    <span className="text-muted-foreground w-20 truncate">{r.deviceName || 'Unknown'}</span>
                    <span className="capitalize w-24">{r.dataType.replace(/_/g, ' ')}</span>
                    <span className={`${color} font-bold`}>{r.value} {r.unit}</span>
                    <span className="text-muted-foreground ml-auto">{r.timestamp.toLocaleTimeString()}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Status Overview */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-4 gap-4">
          <div className="glass-card rounded-lg p-4 text-center">
            <BluetoothSearching className="w-6 h-6 mx-auto text-primary mb-2" />
            <p className="font-mono text-2xl neon-text">{devices.length}</p>
            <p className="text-[10px] text-muted-foreground font-mono">Discovered</p>
          </div>
          <div className="glass-card rounded-lg p-4 text-center">
            <BluetoothConnected className="w-6 h-6 mx-auto text-green-400 mb-2" />
            <p className="font-mono text-2xl text-green-400">{connectedCount}</p>
            <p className="text-[10px] text-muted-foreground font-mono">Connected</p>
          </div>
          <div className="glass-card rounded-lg p-4 text-center">
            <Activity className="w-6 h-6 mx-auto text-red-400 mb-2" />
            <p className="font-mono text-2xl text-red-400">{monitoringCount}</p>
            <p className="text-[10px] text-muted-foreground font-mono">Monitoring</p>
          </div>
          <div className="glass-card rounded-lg p-4 text-center">
            <Wifi className="w-6 h-6 mx-auto text-accent mb-2" />
            <p className="font-mono text-2xl text-accent">{liveReadings.length}</p>
            <p className="text-[10px] text-muted-foreground font-mono">Readings</p>
          </div>
        </motion.div>

        {/* Device List */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <Cpu className="w-4 h-4" /> Nearby Devices
          </h3>

          {devices.length === 0 ? (
            <div className="glass-card rounded-xl p-12 text-center">
              <Bluetooth className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground text-sm font-mono">
                {scanning ? 'Searching for devices...' : 'Tap "Scan Devices" to discover nearby Bluetooth devices'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <AnimatePresence>
                {sortedDevices.map(device => {
                  const DeviceIcon = getDeviceIcon(device.name);
                  const RssiIcon = getRssiIcon(device.rssi);
                  const isExpanded = expandedDevice === device.deviceId;
                  const isMonitoring = monitoring.has(device.deviceId);

                  // Get device-specific readings
                  const deviceReadings = Object.values(latestByType).filter(r => r.deviceId === device.deviceId);

                  return (
                    <motion.div
                      key={device.deviceId}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`glass-card rounded-xl p-4 cursor-pointer transition-all hover:neon-border ${
                        device.connected ? 'border border-green-400/30' : ''
                      } ${isMonitoring ? 'border border-red-400/30 shadow-[0_0_15px_-5px_rgba(248,113,113,0.3)]' : ''
                      } ${isExpanded ? 'neon-border' : ''}`}
                      onClick={() => setExpandedDevice(isExpanded ? null : device.deviceId)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            isMonitoring ? 'bg-red-400/10 border border-red-400/30' :
                            device.connected ? 'bg-green-400/10 border border-green-400/30' : 'bg-secondary/50 border border-border/30'
                          }`}>
                            <DeviceIcon className={`w-5 h-5 ${
                              isMonitoring ? 'text-red-400 animate-pulse' :
                              device.connected ? 'text-green-400' : 'text-muted-foreground'
                            }`} />
                          </div>
                          <div>
                            <p className="font-mono text-sm">{device.name || 'Unknown Device'}</p>
                            <p className="text-[9px] font-mono text-muted-foreground truncate max-w-[180px]">
                              {device.deviceId.slice(0, 20)}...
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <RssiIcon className={`w-4 h-4 ${
                            device.rssi && device.rssi >= -50 ? 'text-green-400'
                              : device.rssi && device.rssi >= -70 ? 'text-yellow-400'
                              : 'text-muted-foreground'
                          }`} />
                          {isMonitoring && (
                            <Badge className="bg-red-400/10 text-red-400 border-red-400/30 text-[8px] font-mono animate-pulse">
                              LIVE
                            </Badge>
                          )}
                          {device.connected && !isMonitoring && (
                            <Badge className="bg-green-400/10 text-green-400 border-green-400/30 text-[8px] font-mono">
                              LINKED
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Inline live readings for monitored devices */}
                      {isMonitoring && deviceReadings.length > 0 && (
                        <div className="flex gap-3 mb-2 py-2 border-y border-border/20">
                          {deviceReadings.filter(r => r.dataType !== 'battery').map(r => {
                            const Icon = getReadingIcon(r.dataType);
                            const color = getReadingColor(r.dataType);
                            return (
                              <div key={r.dataType} className="flex items-center gap-1.5">
                                <Icon className={`w-3 h-3 ${color}`} />
                                <span className={`font-mono text-xs ${color} font-bold`}>{r.value}</span>
                                <span className="text-[8px] text-muted-foreground">{r.unit}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Signal bar */}
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono text-muted-foreground w-12">Signal</span>
                        <Progress
                          value={device.rssi ? Math.min(100, Math.max(0, (device.rssi + 100) * 1.5)) : 0}
                          className="h-1 flex-1"
                        />
                        <span className="text-[9px] font-mono text-muted-foreground w-14 text-right">
                          {getRssiStrength(device.rssi)}
                        </span>
                      </div>

                      {/* Expanded Details */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-3 mt-2 border-t border-border/30 space-y-3">
                              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                                <div>
                                  <span className="text-muted-foreground">RSSI:</span>{' '}
                                  <span>{device.rssi ?? 'N/A'} dBm</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Services:</span>{' '}
                                  <span>{device.services.length}</span>
                                </div>
                                <div className="col-span-2">
                                  <span className="text-muted-foreground">Last Seen:</span>{' '}
                                  <span>{device.lastSeen.toLocaleTimeString()}</span>
                                </div>
                              </div>

                              {device.services.length > 0 && (
                                <div>
                                  <p className="text-[9px] font-mono text-muted-foreground mb-1">Service UUIDs:</p>
                                  <div className="flex flex-wrap gap-1">
                                    {device.services.slice(0, 4).map(s => (
                                      <Badge key={s} variant="outline" className="text-[7px] font-mono">
                                        {s.slice(0, 8)}...
                                      </Badge>
                                    ))}
                                    {device.services.length > 4 && (
                                      <Badge variant="outline" className="text-[7px] font-mono">
                                        +{device.services.length - 4} more
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )}

                              <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                                {device.connected ? (
                                  <>
                                    <Button
                                      size="sm"
                                      className={`flex-1 h-7 text-[10px] font-mono ${
                                        isMonitoring
                                          ? 'bg-red-400/10 text-red-400 border border-red-400/30 hover:bg-red-400/20'
                                          : 'bg-primary text-primary-foreground'
                                      }`}
                                      onClick={() => handleToggleMonitor(device)}
                                    >
                                      {isMonitoring ? (
                                        <><Activity className="w-3 h-3 mr-1" /> Stop Monitor</>
                                      ) : (
                                        <><Heart className="w-3 h-3 mr-1" /> Monitor Health</>
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-[10px] font-mono text-destructive border-destructive/30 hover:bg-destructive/10"
                                      onClick={() => handleDisconnect(device)}
                                    >
                                      <PowerOff className="w-3 h-3" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    size="sm"
                                    className="flex-1 h-7 text-[10px] font-mono bg-primary text-primary-foreground"
                                    onClick={() => handleConnect(device)}
                                  >
                                    <Power className="w-3 h-3 mr-1" /> Connect
                                  </Button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default DeviceHub;
