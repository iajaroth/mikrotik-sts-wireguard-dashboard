import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface WireGuardPeer {
  ".id": string;
  "allowed-address": string;
  "client-endpoint": string;
  comment?: string;
  "current-endpoint-address": string;
  interface: string;
  "last-handshake"?: string;
  name?: string;
  disabled?: boolean;
}

interface ProcessedPeer {
  id: string;
  name: string;
  wgIP: string;
  lans: string[];
  status: string;
  lastHandshake: string;
  comment: string;
  endpointAddress: string;
}

const DDNS_RESERVED_MCS = [2, 7, 14, 20, 26, 46, 62, 66, 70];
const STATIC_OVERRIDES = [
  { mcNumber: 5, lan: '172.16.100.26' },
  { mcNumber: 8, lan: '190.2.221.40:10554' },
  { mcNumber: 19, lan: '192.168.13.0/24' },
  { mcNumber: 21, lan: '201.193.161.165' },
  { mcNumber: 22, lan: '192.168.11.0/24' },
  { mcNumber: 31, lan: '177.93.6.24' },
  { mcNumber: 38, lan: '201.192.162.70:5554' },
  { mcNumber: 63, lan: '177.93.31.175' },
];

const MonitorEnlaces = () => {
  const { toast } = useToast();
  const [peers, setPeers] = useState<ProcessedPeer[]>([]);
  const [filteredPeers, setFilteredPeers] = useState<ProcessedPeer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    reserved: 0,
    static: 0,
    available: 0,
  });

  const fetchPeers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mikrotik-fetch');
      
      if (error) throw error;
      
      if (data.success) {
        const processed = processPeers(data.data);
        setPeers(processed);
        setFilteredPeers(processed);
        calculateStats(processed);
        toast({
          title: "Datos actualizados",
          description: `${processed.length} enlaces cargados correctamente`,
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error al cargar datos",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const processPeers = (rawPeers: WireGuardPeer[]): ProcessedPeer[] => {
    const processedPeers: ProcessedPeer[] = [];
    const usedMCs = new Set<number>();
    const usedWGIPs = new Set<number>();
    const usedLANs = new Set<string>();

    // Procesar peers existentes
    rawPeers.forEach((peer) => {
      const name = peer.name || peer.comment || "Sin nombre";
      const wgIPMatch = peer["allowed-address"].match(/100\.100\.100\.(\d+)/);
      const wgIPSuffix = wgIPMatch ? parseInt(wgIPMatch[1]) : null;
      const wgIP = wgIPSuffix ? `100.100.100.${wgIPSuffix}` : "N/A";
      
      if (wgIPSuffix) usedWGIPs.add(wgIPSuffix);
      
      const lans = peer["allowed-address"]
        .split(',')
        .filter(addr => !addr.includes('100.100.100') && !addr.includes('172.16.100'))
        .map(addr => addr.trim());

      lans.forEach(lan => usedLANs.add(lan));

      const isActive = peer["last-handshake"] && 
                      !peer["last-handshake"].includes('h') && 
                      !peer["last-handshake"].includes('d') &&
                      !peer["last-handshake"].includes('w');

      let status = isActive ? 'active' : 'inactive';
      
      const mcMatch = name.match(/^(?:WIREGUARD-)?MC(\d+)(?:[_-]|$)/i);
      if (mcMatch) {
        const mcNum = parseInt(mcMatch[1]);
        usedMCs.add(mcNum);
        
        if (DDNS_RESERVED_MCS.includes(mcNum)) {
          status = 'reserved-ddns';
        }
        if (STATIC_OVERRIDES.some(s => s.mcNumber === mcNum)) {
          status = 'static-override';
        }
      }

      processedPeers.push({
        id: peer[".id"],
        name,
        wgIP,
        lans,
        status,
        lastHandshake: peer["last-handshake"] || "never",
        comment: peer.comment || "",
        endpointAddress: peer["current-endpoint-address"] || "N/A",
      });
    });

    // Agregar LANs de STATIC_OVERRIDES al conjunto de LANs usadas
    STATIC_OVERRIDES.forEach(({ lan }) => {
      // Normalizar formato para 192.168.X.0/24
      if (lan.includes('192.168.') && !lan.includes(':')) {
        const match = lan.match(/192\.168\.(\d+)\./);
        if (match) {
          usedLANs.add(`192.168.${match[1]}.0/24`);
        } else if (lan.includes('/24')) {
          usedLANs.add(lan);
        }
      }
    });

    // Agregar estáticos que no están en peers
    STATIC_OVERRIDES.forEach(({ mcNumber, lan }) => {
      if (!usedMCs.has(mcNumber)) {
        usedMCs.add(mcNumber);
        processedPeers.push({
          id: `static-${mcNumber}`,
          name: `MC${String(mcNumber).padStart(2, '0')}`,
          wgIP: "N/A",
          lans: [lan],
          status: 'static-override',
          lastHandshake: "N/A",
          comment: `Manual: ${lan}`,
          endpointAddress: "N/A",
        });
      }
    });

    // Agregar reservados DDNS que no están en peers
    DDNS_RESERVED_MCS.forEach(mcNum => {
      if (!usedMCs.has(mcNum)) {
        usedMCs.add(mcNum);
        processedPeers.push({
          id: `ddns-${mcNum}`,
          name: `MC${String(mcNum).padStart(2, '0')}`,
          wgIP: "Reserved for DDNS",
          lans: [],
          status: 'reserved-ddns',
          lastHandshake: "N/A",
          comment: "Reservado para DDNS",
          endpointAddress: "N/A",
        });
      }
    });

    // Generar disponibles (MC 1-200 que no están usados)
    for (let i = 1; i <= 200; i++) {
      if (!usedMCs.has(i)) {
        const nextWGIP = Array.from({ length: 254 }, (_, idx) => idx + 2)
          .find(suffix => !usedWGIPs.has(suffix)) || 2;
        const nextLAN = Array.from({ length: 200 }, (_, idx) => `192.168.${idx + 10}.0/24`)
          .find(lan => !usedLANs.has(lan)) || "192.168.10.0/24";

        processedPeers.push({
          id: `available-${i}`,
          name: `MC${String(i).padStart(2, '0')}`,
          wgIP: `➡️ 100.100.100.${nextWGIP}`,
          lans: [`➡️ ${nextLAN}`],
          status: 'available',
          lastHandshake: "N/A",
          comment: "Siguiente disponible",
          endpointAddress: "N/A",
        });
        
        usedWGIPs.add(nextWGIP);
        usedLANs.add(nextLAN);
      }
    }

    // Ordenar: primero MCs numerados, luego otros
    return processedPeers.sort((a, b) => {
      const mcA = a.name.match(/^MC(\d+)/);
      const mcB = b.name.match(/^MC(\d+)/);
      
      if (mcA && mcB) {
        return parseInt(mcA[1]) - parseInt(mcB[1]);
      }
      if (mcA) return -1;
      if (mcB) return 1;
      return a.name.localeCompare(b.name);
    });
  };

  const calculateStats = (peersList: ProcessedPeer[]) => {
    const stats = {
      total: peersList.length,
      active: peersList.filter(p => p.status === 'active').length,
      inactive: peersList.filter(p => p.status === 'inactive').length,
      reserved: peersList.filter(p => p.status === 'reserved-ddns').length,
      static: peersList.filter(p => p.status === 'static-override').length,
      available: peersList.filter(p => p.status === 'available').length,
    };
    setStats(stats);
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 inline opacity-50" />;
    }
    return sortDirection === "asc" ? 
      <ArrowUp className="h-4 w-4 ml-1 inline" /> : 
      <ArrowDown className="h-4 w-4 ml-1 inline" />;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      'active': { variant: 'default', label: '✅ Activo' },
      'inactive': { variant: 'secondary', label: '⚠️ Inactivo' },
      'reserved-ddns': { variant: 'outline', label: '🔒 DDNS' },
      'static-override': { variant: 'destructive', label: '🌐 Estático' },
      'available': { variant: 'outline', label: '🆓 Disponible' },
    };
    const config = variants[status] || { variant: 'outline', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  useEffect(() => {
    fetchPeers();
  }, []);

  useEffect(() => {
    let filtered = peers;

    if (searchTerm) {
      filtered = filtered.filter(peer =>
        peer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        peer.wgIP.includes(searchTerm) ||
        peer.comment.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(peer => peer.status === filterStatus);
    }

    // Aplicar ordenamiento
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortColumn) {
          case 'name':
            aValue = a.name;
            bValue = b.name;
            break;
          case 'wgIP':
            // Extraer número de IP para ordenar correctamente
            const aMatch = a.wgIP.match(/100\.100\.100\.(\d+)/);
            const bMatch = b.wgIP.match(/100\.100\.100\.(\d+)/);
            aValue = aMatch ? parseInt(aMatch[1]) : 0;
            bValue = bMatch ? parseInt(bMatch[1]) : 0;
            break;
          case 'lans':
            aValue = a.lans.join(',');
            bValue = b.lans.join(',');
            break;
          case 'status':
            aValue = a.status;
            bValue = b.status;
            break;
          case 'lastHandshake':
            aValue = a.lastHandshake;
            bValue = b.lastHandshake;
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredPeers(filtered);
  }, [searchTerm, filterStatus, peers, sortColumn, sortDirection]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Monitor de Enlaces WireGuard</CardTitle>
              <CardDescription>Datos en tiempo real desde mikrotik-sts.cr-safe.com</CardDescription>
            </div>
            <Button onClick={fetchPeers} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-primary">{stats.total}</div>
                <p className="text-xs text-muted-foreground">Total Enlaces</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">{stats.active}</div>
                <p className="text-xs text-muted-foreground">✅ Activos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-yellow-600">{stats.inactive}</div>
                <p className="text-xs text-muted-foreground">⚠️ Inactivos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-blue-600">{stats.reserved}</div>
                <p className="text-xs text-muted-foreground">🔒 DDNS</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-purple-600">{stats.static}</div>
                <p className="text-xs text-muted-foreground">🌐 Estático</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-gray-600">{stats.available}</div>
                <p className="text-xs text-muted-foreground">🆓 Disponibles</p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Input
              placeholder="🔍 Buscar por ID, IP, o comentario..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <div className="flex gap-2 flex-wrap">
              <Button
                variant={filterStatus === 'all' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('all')}
                size="sm"
              >
                Todos
              </Button>
              <Button
                variant={filterStatus === 'active' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('active')}
                size="sm"
              >
                ✅ Activos
              </Button>
              <Button
                variant={filterStatus === 'inactive' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('inactive')}
                size="sm"
              >
                ⚠️ Inactivos
              </Button>
              <Button
                variant={filterStatus === 'reserved-ddns' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('reserved-ddns')}
                size="sm"
              >
                🔒 DDNS
              </Button>
              <Button
                variant={filterStatus === 'static-override' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('static-override')}
                size="sm"
              >
                🌐 Estático
              </Button>
              <Button
                variant={filterStatus === 'available' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('available')}
                size="sm"
              >
                🆓 Disponibles
              </Button>
            </div>
          </div>

          <div className="rounded-md border mt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('name')}
                  >
                    ID{getSortIcon('name')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('wgIP')}
                  >
                    IP WireGuard{getSortIcon('wgIP')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('lans')}
                  >
                    LANs{getSortIcon('lans')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('status')}
                  >
                    Estado{getSortIcon('status')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('lastHandshake')}
                  >
                    Último Handshake{getSortIcon('lastHandshake')}
                  </TableHead>
                  <TableHead>Comentario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPeers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {loading ? "Cargando..." : "No se encontraron enlaces"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPeers.map((peer) => (
                    <TableRow key={peer.id}>
                      <TableCell className="font-medium">{peer.name}</TableCell>
                      <TableCell className="font-mono text-sm">{peer.wgIP}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {peer.lans.length > 0 ? peer.lans.join(', ') : '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(peer.status)}</TableCell>
                      <TableCell>{peer.lastHandshake}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{peer.comment || '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MonitorEnlaces;
