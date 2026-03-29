import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useBluetooth, BluetoothDevice } from '@/hooks/useBluetooth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Bluetooth, BluetoothSearching, BluetoothConnected,
  BluetoothOff, Radio, Signal, SignalLow, SignalMedium, SignalHigh,
  Smartphone, Watch, Speaker, Cpu, Monitor, Loader2, AlertTriangle,
  Power, PowerOff, Wifi,
} from 'lucide-react';

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

const DeviceHub = () => {
  const { toast } = useToast();
  const {
    devices, scanning, error, isNative,
    startScan, stopScan, connectDevice, disconnectDevice,
  } = useBluetooth();
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);

  const connectedCount = devices.filter(d => d.connected).length;

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

  // Sort: connected first, then by signal strength
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
                Bluetooth LE • {devices.length} discovered • {connectedCount} connected
              </p>
            </div>
          </div>

          <Button
            onClick={handleScan}
            className={`font-mono text-xs ${scanning
              ? 'bg-destructive/20 border border-destructive/30 text-destructive hover:bg-destructive/30'
              : 'bg-primary text-primary-foreground'}`}
          >
            {scanning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Stop Scan
              </>
            ) : (
              <>
                <BluetoothSearching className="w-4 h-4 mr-2" /> Scan Devices
              </>
            )}
          </Button>
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
                  Bluetooth requires running as a native app. Export to GitHub, add iOS/Android platforms with Capacitor, and run on a real device to use this feature.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Error Banner */}
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
              <motion.div
                className="h-full bg-primary"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 15, ease: 'linear' }}
              />
            </div>
          </motion.div>
        )}

        {/* Status Overview */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-3 gap-4">
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
            <Wifi className="w-6 h-6 mx-auto text-accent mb-2" />
            <p className="font-mono text-2xl text-accent">{devices.filter(d => d.services.length > 0).length}</p>
            <p className="text-[10px] text-muted-foreground font-mono">Services</p>
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

                  return (
                    <motion.div
                      key={device.deviceId}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`glass-card rounded-xl p-4 cursor-pointer transition-all hover:neon-border ${
                        device.connected ? 'border border-green-400/30' : ''
                      } ${isExpanded ? 'neon-border' : ''}`}
                      onClick={() => setExpandedDevice(isExpanded ? null : device.deviceId)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            device.connected ? 'bg-green-400/10 border border-green-400/30' : 'bg-secondary/50 border border-border/30'
                          }`}>
                            <DeviceIcon className={`w-5 h-5 ${device.connected ? 'text-green-400' : 'text-muted-foreground'}`} />
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
                          {device.connected && (
                            <Badge className="bg-green-400/10 text-green-400 border-green-400/30 text-[8px] font-mono">
                              LINKED
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Signal Strength Bar */}
                      <div className="flex items-center gap-2 mb-2">
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
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 h-7 text-[10px] font-mono text-destructive border-destructive/30 hover:bg-destructive/10"
                                    onClick={() => handleDisconnect(device)}
                                  >
                                    <PowerOff className="w-3 h-3 mr-1" /> Disconnect
                                  </Button>
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
