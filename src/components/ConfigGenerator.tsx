import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Copy, Download, Lightbulb, FileText, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

const ConfigGenerator = () => {
  const { toast } = useToast();
  const [configMode, setConfigMode] = useState("complete");
  const [clientID, setClientID] = useState("");
  const [clientIPSuffix, setClientIPSuffix] = useState("");
  const [lanNetwork, setLanNetwork] = useState("");
  const [dhcpStart, setDhcpStart] = useState("10");
  const [dhcpEnd, setDhcpEnd] = useState("100");
  const [dnsServers, setDnsServers] = useState("8.8.8.8,8.8.4.4");
  const [clientPubKey, setClientPubKey] = useState("");
  const [includeLAN, setIncludeLAN] = useState(false);
  const [setupDNAT, setSetupDNAT] = useState(false);
  const [cameraType, setCameraType] = useState("Dahua");
  const [numCameras, setNumCameras] = useState(1);
  const [cameraIPs, setCameraIPs] = useState<string[]>([""]);
  const [showResults, setShowResults] = useState(false);
  const [suggestedIP, setSuggestedIP] = useState<number | null>(null);
  const [suggestedLAN, setSuggestedLAN] = useState<string>("");
  const [suggestedMC, setSuggestedMC] = useState<number | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [configSections, setConfigSections] = useState<{
    summary: { clientID: string; wgIP: string; interface: string; lanNetwork: string; routerIP: string; dhcpPool: string; dns: string; cameras: string; portBase: string; watchdog: string; };
    base: string;
    wireguard: string;
    dnat: string;
    watchdog: string;
    serverCommands: string;
    cameraURLs: string;
  } | null>(null);

  useEffect(() => {
    const newCameraIPs = Array(numCameras).fill("").map((_, i) => cameraIPs[i] || "");
    setCameraIPs(newCameraIPs);
  }, [numCameras]);

  useEffect(() => {
    fetchSuggestion();
  }, []);

  const fetchSuggestion = async () => {
    setLoadingSuggestion(true);
    try {
      const { data, error } = await supabase.functions.invoke('mikrotik-fetch');
      
      if (error) throw error;
      
      if (data.success) {
        const usedMCs = new Set<number>();
        const usedWGIPs = new Set<number>();
        const usedLANs = new Set<string>();
        
        data.data.forEach((peer: any) => {
          // Extraer MC del nombre
          const name = peer.name || peer.comment || "";
          const mcMatch = name.match(/^(?:WIREGUARD-)?MC(\d+)(?:[_-]|$)/i);
          if (mcMatch) {
            usedMCs.add(parseInt(mcMatch[1]));
          }
          
          // Extraer IP WireGuard
          const wgIPMatch = peer["allowed-address"].match(/100\.100\.100\.(\d+)/);
          if (wgIPMatch) {
            usedWGIPs.add(parseInt(wgIPMatch[1]));
          }
          
          // Extraer LANs
          const lans = peer["allowed-address"]
            .split(',')
            .filter((addr: string) => !addr.includes('100.100.100') && !addr.includes('172.16.100'))
            .map((addr: string) => addr.trim());
          
          lans.forEach((lan: string) => usedLANs.add(lan));
        });

        // MCs estáticos y DDNS reservados
        const DDNS_RESERVED_MCS = [2, 7, 14, 20, 26, 46, 62, 66, 70];
        const STATIC_OVERRIDES = [5, 8, 19, 21, 22, 31, 38, 63];
        
        DDNS_RESERVED_MCS.forEach(mc => usedMCs.add(mc));
        STATIC_OVERRIDES.forEach(mc => usedMCs.add(mc));

        // Encontrar siguiente MC disponible (1-200)
        const nextMC = Array.from({ length: 200 }, (_, idx) => idx + 1)
          .find(mc => !usedMCs.has(mc)) || 1;

        // Encontrar siguiente IP WireGuard disponible
        const nextWGIP = Array.from({ length: 252 }, (_, idx) => idx + 2)
          .find(suffix => !usedWGIPs.has(suffix)) || 2;
        
        // Encontrar siguiente LAN disponible
        const nextLAN = Array.from({ length: 200 }, (_, idx) => `192.168.${idx + 10}`)
          .find(lan => !usedLANs.has(`${lan}.0/24`)) || "192.168.10";

        setSuggestedMC(nextMC);
        setSuggestedIP(nextWGIP);
        setSuggestedLAN(nextLAN);
      }
    } catch (error) {
      console.error('Error fetching suggestion:', error);
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const applySuggestion = () => {
    if (suggestedMC) {
      setClientID(`MC${String(suggestedMC).padStart(2, '0')}`);
    }
    if (suggestedIP) {
      setClientIPSuffix(suggestedIP.toString());
    }
    if (suggestedLAN) {
      setLanNetwork(suggestedLAN);
    }
    toast({
      title: "Sugerencia aplicada",
      description: "Se han completado los campos con los valores sugeridos",
    });
  };

  const generateBaseConfig = () => {
    return `# ================================================================
# CONFIGURACION BASE PARA CLIENTE: ${clientID}
# IP WireGuard: 100.100.100.${clientIPSuffix}
# Red LAN: ${lanNetwork}.0/24
# ================================================================

# 1. CONFIGURACION BASICA DE RED
/interface bridge add name=LAN-Bridge comment="Red Local"
/interface bridge port add bridge=LAN-Bridge interface=ether2 comment="Puerto LAN"
/interface bridge port add bridge=LAN-Bridge interface=ether3 comment="Puerto LAN"
/interface bridge port add bridge=LAN-Bridge interface=ether4 comment="Puerto LAN"
/interface bridge port add bridge=LAN-Bridge interface=ether5 comment="Puerto LAN"

# 2. CONFIGURACION IP
/ip address add address=${lanNetwork}.1/24 interface=LAN-Bridge comment="IP Router"
/ip dhcp-client add interface=ether1 disabled=no comment="Internet"

# 3. CONFIGURACION DNS
/ip dns set servers=${dnsServers} allow-remote-requests=yes

# 4. CONFIGURACION DHCP
/ip pool add name=pool-lan ranges=${lanNetwork}.${dhcpStart}-${lanNetwork}.${dhcpEnd}
/ip dhcp-server add name=dhcp-lan interface=LAN-Bridge address-pool=pool-lan disabled=no
/ip dhcp-server network add address=${lanNetwork}.0/24 gateway=${lanNetwork}.1 dns-server=${dnsServers}

# 5. CONFIGURACION NAT
/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="Internet NAT"

# 6. CAMBIAR CONTRASEÑA
/user set admin password="StS2021!!"
`;
  };

  const generateWireGuardConfig = () => {
    let allowedNetworks = "172.16.100.0/24,100.100.100.1/32";
    if (configMode === "complete" || (configMode === "wireguard" && includeLAN && lanNetwork)) {
      allowedNetworks += `,${lanNetwork}.0/24`;
    }
    
    return `
# ================================================================
# CONFIGURACION WIREGUARD PARA CLIENTE: ${clientID}
# IP WireGuard: 100.100.100.${clientIPSuffix}
# ================================================================

/interface wireguard add name=WIREGUARD-${clientID} listen-port=13231 comment="WireGuard ${clientID}"
/ip address add address=100.100.100.${clientIPSuffix}/24 interface=WIREGUARD-${clientID} comment="WireGuard IP"
/interface wireguard peers add interface=WIREGUARD-${clientID} name=SERVER-${clientID} comment="Servidor ${clientID}" public-key="${clientPubKey}" endpoint-address="mikrotik-sts.cr-safe.com" endpoint-port=13231 allowed-address="${allowedNetworks}" persistent-keepalive=25s
/ip route add dst-address=172.16.100.0/24 gateway=100.100.100.1 comment="Ruta WireGuard"

/ip firewall filter add chain=forward in-interface=WIREGUARD-${clientID} out-interface=LAN-Bridge action=accept comment="WG->LAN ${clientID}"
/ip firewall filter add chain=forward in-interface=LAN-Bridge out-interface=WIREGUARD-${clientID} action=accept comment="LAN->WG ${clientID}"
/ip firewall filter add chain=forward src-address=172.16.100.0/24 in-interface=WIREGUARD-${clientID} out-interface=LAN-Bridge action=accept comment="Monitoreo->LAN ${clientID}"
`;
  };

  const generateDNATConfig = () => {
    if (configMode === "complete" && !setupDNAT) return "";
    if (configMode === "dnat" && cameraIPs.filter(ip => ip.trim()).length === 0) return "";

    const portBase = 8000 + (parseInt(clientIPSuffix) * 10);
    let config = `# ================================================================
# CONFIGURACION DNAT PARA CAMARAS ${cameraType}
# Cliente: ${clientID}
# Base de puertos: ${portBase}
# ================================================================
`;

    cameraIPs.forEach((ip, i) => {
      if (!ip.trim()) return;
      const cameraNum = i + 1;
      const httpPort = portBase + cameraNum;
      const rtspPort = portBase + cameraNum + 50;
      
      config += `
# Camara ${cameraNum} (${ip})
/ip firewall nat add chain=dstnat in-interface=WIREGUARD-${clientID} dst-address=100.100.100.${clientIPSuffix} protocol=tcp dst-port=${httpPort} action=dst-nat to-addresses=${ip} to-ports=80 comment="HTTP Cam${cameraNum} ${clientID}"
/ip firewall nat add chain=dstnat src-address=172.16.100.0/24 dst-address=100.100.100.${clientIPSuffix} protocol=tcp dst-port=${httpPort} action=dst-nat to-addresses=${ip} to-ports=80 comment="HTTP-MON Cam${cameraNum} ${clientID}"
/ip firewall nat add chain=dstnat in-interface=WIREGUARD-${clientID} dst-address=100.100.100.${clientIPSuffix} protocol=tcp dst-port=${rtspPort} action=dst-nat to-addresses=${ip} to-ports=554 comment="RTSP Cam${cameraNum} ${clientID}"
/ip firewall nat add chain=dstnat src-address=172.16.100.0/24 dst-address=100.100.100.${clientIPSuffix} protocol=tcp dst-port=${rtspPort} action=dst-nat to-addresses=${ip} to-ports=554 comment="RTSP-MON Cam${cameraNum} ${clientID}"
`;
    });

    return config;
  };

  const generateWatchdogConfig = () => {
    return `# WATCHDOG NO INTRUSIVO - RESET DE SOCKET UDP (PORT TOGGLE)
# En lugar de apagar la interfaz, cambiamos el puerto de escucha
# para forzar al kernel a reiniciar el socket UDP sin tirar la interfaz.
# ================================================================

# Script: Monitorizacion y Port Toggle
/system script add name=watchdog-wg-socket-reset policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source={
:local wgInterface "WIREGUARD-${clientID}"
:local serverIP "100.100.100.1"
:local clientID "${clientID}"
:local originalPort 13231
:local togglePort 13230

# 1. Verificar conectividad
:if ([/ping \\$serverIP count=5 interval=1s] = 0) do={
    :log warning "[\\$clientID Watchdog] CONEXION PERDIDA. Iniciando Reset de Socket (Port Toggle)..."

    # 2. Metodo: Cambiar Listen Port
    # Esto obliga a MikroTik a liberar el socket UDP y volver a enlazarlo
    
    :do {
        :log info "[\\$clientID Watchdog] Cambiando puerto a \\$togglePort..."
        /interface wireguard set [find name=\\$wgInterface] listen-port=\\$togglePort
        
        :delay 1s
        
        :log info "[\\$clientID Watchdog] Restaurando puerto a \\$originalPort..."
        /interface wireguard set [find name=\\$wgInterface] listen-port=\\$originalPort
        
        :log warning "[\\$clientID Watchdog] Socket UDP reiniciado. Esperando handshake..."
    } on-error={ 
        :log error "[\\$clientID Watchdog] ERROR CRITICO al intentar cambiar puertos" 
    }

} 
# Si el ping funciona, no hacemos nada (silencioso)
}

# Script Critico: Reinicio del Sistema (Failsafe 3h)
/system script add name=watchdog-system-reboot policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source={
:local serverIP "100.100.100.1"
:local clientID "${clientID}"

:if ([/ping \\$serverIP count=10 interval=1s] = 0) do={
    :log error "[\\$clientID Critical] FALLA TOTAL DE CONECTIVIDAD - Reiniciando Router..."
    :delay 5s
    /system reboot
}
}

# ================================================================
# VERIFICAR Y CONFIGURAR DEVICE-MODE
# ================================================================

:local currentMode [/system device-mode get mode]
:if (\\$currentMode != "disabled") do={
    :put "ADVERTENCIA: Device-mode debe ser 'disabled'. Ejecute: /system device-mode update mode=disabled"
    :error "Modo restrictivo detectado"
}

# ================================================================
# CREAR TAREAS PROGRAMADAS
# ================================================================

# Limpiar tareas antiguas
:do { /system scheduler remove [find name=watchdog-down-scheduler] } on-error={}
:do { /system scheduler remove [find name=watchdog-up-scheduler] } on-error={}
:do { /system scheduler remove [find name=watchdog-monitor-scheduler] } on-error={}

:put "Creando tareas de monitoreo..."

# Tarea Principal: Corre cada 2 minutos
:do {
    /system scheduler add name=watchdog-socket-scheduler interval=2m on-event=watchdog-wg-socket-reset start-time=startup comment="Monitor WG - Port Toggle cada 2 min"
    :put "  [OK] Monitor Socket Reset creado (2 min)"
} on-error={ :put "  [ERROR] Fallo al crear monitor scheduler" }

# Tarea Critica: Corre cada 3 horas
:do {
    /system scheduler add name=watchdog-system-critical interval=3h on-event=watchdog-system-reboot start-time=startup comment="Reinicio critico si falla todo"
    :put "  [OK] Watchdog Critico creado (3 horas)"
} on-error={ :put "  [ERROR] Fallo al crear critical scheduler" }

:put ""
:put "WATCHDOG NO INTRUSIVO CONFIGURADO"`;
  };

  const generateServerCommands = () => {
    return `# ================================================================
# COMANDOS PARA EL SERVIDOR WIREGUARD
# Cliente: ${clientID}
# IP: 100.100.100.${clientIPSuffix}
# Llave Publica: ${clientPubKey}
# ================================================================

# Agregar Peer
/interface wireguard peers add interface=wireguard-server name=${clientID} comment="${clientID} / IP 30" public-key="${clientPubKey}" allowed-address=100.100.100.${clientIPSuffix}/32,${lanNetwork}.0/24

# Agregar Ruta
/ip route add dst-address=${lanNetwork}.0/24 gateway=100.100.100.${clientIPSuffix} comment="Ruta ${clientID}"`;
  };

  const generateCameraURLs = () => {
    if (!setupDNAT && configMode === "complete") return "";
    if (cameraIPs.filter(ip => ip.trim()).length === 0) return "";

    const portBase = 8000 + (parseInt(clientIPSuffix) * 10);
    let urls = "";

    cameraIPs.forEach((ip, i) => {
      if (!ip.trim()) return;
      const cameraNum = i + 1;
      const httpPort = portBase + cameraNum;
      const rtspPort = portBase + cameraNum + 50;
      
      urls += `📹 Cámara ${cameraNum} (${ip})\n`;
      urls += `HTTP: http://100.100.100.${clientIPSuffix}:${httpPort}\n`;
      urls += `RTSP Puerto: ${rtspPort}\n`;
      urls += `RTSP Main: rtsp://100.100.100.${clientIPSuffix}:${rtspPort}/cam/realmonitor?channel=1&subtype=0\n`;
      urls += `RTSP Sub:  rtsp://100.100.100.${clientIPSuffix}:${rtspPort}/cam/realmonitor?channel=1&subtype=1\n\n`;
    });

    return urls.trim();
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();

    // Validación según modo
    if (configMode === "complete") {
      if (!clientID || !clientIPSuffix || !lanNetwork || !clientPubKey) {
        toast({
          title: "Error",
          description: "Por favor complete todos los campos requeridos",
          variant: "destructive",
        });
        return;
      }
    } else if (configMode === "wireguard") {
      if (!clientID || !clientIPSuffix || !clientPubKey) {
        toast({
          title: "Error",
          description: "Por favor complete ID del Cliente, Sufijo IP y Llave Pública",
          variant: "destructive",
        });
        return;
      }
      if (includeLAN && !lanNetwork) {
        toast({
          title: "Error",
          description: "Por favor especifique la red LAN",
          variant: "destructive",
        });
        return;
      }
    } else if (configMode === "dnat") {
      if (!clientID || !clientIPSuffix) {
        toast({
          title: "Error",
          description: "Por favor complete ID del Cliente y Sufijo IP",
          variant: "destructive",
        });
        return;
      }
    }

    // Generar secciones
    const portBase = 8000 + (parseInt(clientIPSuffix) * 10);
    const numCamerasText = setupDNAT || configMode === "dnat" 
      ? `${cameraIPs.filter(ip => ip.trim()).length} (${cameraType})`
      : "0";

    setConfigSections({
      summary: {
        clientID,
        wgIP: `100.100.100.${clientIPSuffix}`,
        interface: `WIREGUARD-${clientID}`,
        lanNetwork: `${lanNetwork}.0/24`,
        routerIP: `${lanNetwork}.1`,
        dhcpPool: `${lanNetwork}.${dhcpStart} - ${lanNetwork}.${dhcpEnd}`,
        dns: dnsServers.includes("8.8.8.8") ? "Google" : dnsServers.includes("1.1.1.1") ? "Cloudflare" : "OpenDNS",
        cameras: numCamerasText,
        portBase: portBase.toString(),
        watchdog: "Socket Reset",
      },
      base: generateBaseConfig(),
      wireguard: generateWireGuardConfig(),
      dnat: generateDNATConfig(),
      watchdog: generateWatchdogConfig(),
      serverCommands: generateServerCommands(),
      cameraURLs: generateCameraURLs(),
    });

    setShowResults(true);
  };

  const copyToClipboard = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado",
      description: `${section} copiado al portapapeles`,
    });
  };

  const downloadSection = (text: string, filename: string) => {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadFullConfig = () => {
    if (!configSections) return;
    
    let fullConfig = `${configSections.base}\n${configSections.wireguard}\n`;
    if (configSections.dnat) fullConfig += `${configSections.dnat}\n`;
    fullConfig += `\n${configSections.watchdog}\n\n${configSections.serverCommands}`;
    
    downloadSection(fullConfig, `config-${clientID}.rsc`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generador de Configuración MikroTik</CardTitle>
        <CardDescription>WireGuard + DNAT + Watchdog Non-Intrusive</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={configMode} onValueChange={setConfigMode} className="mb-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="complete">Configuración Completa</TabsTrigger>
            <TabsTrigger value="wireguard">Solo WireGuard</TabsTrigger>
            <TabsTrigger value="dnat">Solo DNAT</TabsTrigger>
          </TabsList>

          <TabsContent value="complete" className="mt-6">
            <form onSubmit={handleGenerate} className="space-y-6">
              {suggestedMC && suggestedIP && suggestedLAN && !loadingSuggestion && (
                <Alert className="bg-primary/5 border-primary/20">
                  <Lightbulb className="h-4 w-4" />
                  <AlertDescription className="flex items-center justify-between">
                    <span>
                      Siguiente disponible: <strong>MC{String(suggestedMC).padStart(2, '0')}</strong>, <strong>IP 100.100.100.{suggestedIP}</strong> y <strong>LAN {suggestedLAN}.0/24</strong>
                    </span>
                    <Button type="button" size="sm" onClick={applySuggestion}>
                      Usar Sugerencia
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clientID">ID del Cliente *</Label>
              <Input
                id="clientID"
                placeholder="Ej: MC30, MC47-MONTAIN"
                value={clientID}
                onChange={(e) => setClientID(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientIPSuffix">Sufijo IP WireGuard *</Label>
              <Input
                id="clientIPSuffix"
                type="number"
                placeholder="30"
                min="1"
                max="254"
                value={clientIPSuffix}
                onChange={(e) => setClientIPSuffix(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lanNetwork">Red LAN (3 primeros octetos) *</Label>
            <Input
              id="lanNetwork"
              placeholder="192.168.28"
              value={lanNetwork}
              onChange={(e) => setLanNetwork(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dhcpStart">IP Inicial DHCP</Label>
              <Input
                id="dhcpStart"
                type="number"
                value={dhcpStart}
                onChange={(e) => setDhcpStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dhcpEnd">IP Final DHCP</Label>
              <Input
                id="dhcpEnd"
                type="number"
                value={dhcpEnd}
                onChange={(e) => setDhcpEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dnsServers">Servidor DNS</Label>
            <Select value={dnsServers} onValueChange={setDnsServers}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="8.8.8.8,8.8.4.4">Google (8.8.8.8, 8.8.4.4)</SelectItem>
                <SelectItem value="1.1.1.1,1.0.0.1">Cloudflare (1.1.1.1, 1.0.0.1)</SelectItem>
                <SelectItem value="208.67.222.222,208.67.220.220">OpenDNS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientPubKey">Llave Pública del Cliente WireGuard *</Label>
            <Textarea
              id="clientPubKey"
              placeholder="Pegar la public key generada en el MikroTik"
              value={clientPubKey}
              onChange={(e) => setClientPubKey(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="setupDNAT"
              checked={setupDNAT}
              onCheckedChange={(checked) => setSetupDNAT(checked as boolean)}
            />
            <Label htmlFor="setupDNAT" className="cursor-pointer">
              Configurar DNAT para cámaras IP
            </Label>
          </div>

          {setupDNAT && (
            <div className="space-y-4 p-4 border rounded-lg">
              <div className="space-y-2">
                <Label htmlFor="cameraType">Tipo de Cámaras</Label>
                <Select value={cameraType} onValueChange={setCameraType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dahua">Dahua</SelectItem>
                    <SelectItem value="Hikvision">Hikvision</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="numCameras">Número de Cámaras</Label>
                <Input
                  id="numCameras"
                  type="number"
                  min="1"
                  max="20"
                  value={numCameras}
                  onChange={(e) => setNumCameras(parseInt(e.target.value) || 1)}
                />
              </div>

              <div className="space-y-2">
                <Label>IPs de las Cámaras</Label>
                {cameraIPs.map((ip, index) => (
                  <Input
                    key={index}
                    placeholder={`IP Cámara ${index + 1}`}
                    value={ip}
                    onChange={(e) => {
                      const newIPs = [...cameraIPs];
                      newIPs[index] = e.target.value;
                      setCameraIPs(newIPs);
                    }}
                  />
                ))}
              </div>
            </div>
          )}

              <Button type="submit" className="w-full">
                Generar Configuración
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="wireguard" className="mt-6">
            <Alert className="bg-info/10 border-info/20 mb-6">
              <AlertDescription>
                Esta opción genera solo la configuración de WireGuard para agregar a un MikroTik existente
              </AlertDescription>
            </Alert>

            <form onSubmit={handleGenerate} className="space-y-6">
              {suggestedMC && suggestedIP && suggestedLAN && !loadingSuggestion && (
                <Alert className="bg-primary/5 border-primary/20">
                  <Lightbulb className="h-4 w-4" />
                  <AlertDescription className="flex items-center justify-between">
                    <span>
                      Siguiente disponible: <strong>MC{String(suggestedMC).padStart(2, '0')}</strong>, <strong>IP 100.100.100.{suggestedIP}</strong> y <strong>LAN {suggestedLAN}.0/24</strong>
                    </span>
                    <Button type="button" size="sm" onClick={applySuggestion}>
                      Usar Sugerencia
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clientID-wg">ID del Cliente *</Label>
                  <Input
                    id="clientID-wg"
                    placeholder="Ej: MC30, MC47-MONTAIN, SI07-A"
                    value={clientID}
                    onChange={(e) => setClientID(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">Formato: 2-4 letras + números + letras opcionales</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientIPSuffix-wg">Sufijo IP WireGuard *</Label>
                  <Input
                    id="clientIPSuffix-wg"
                    type="number"
                    placeholder="30"
                    min="1"
                    max="254"
                    value={clientIPSuffix}
                    onChange={(e) => setClientIPSuffix(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientPubKey-wg">Llave Pública del Cliente *</Label>
                <Textarea
                  id="clientPubKey-wg"
                  placeholder="Pegar la public key generada en el MikroTik"
                  value={clientPubKey}
                  onChange={(e) => setClientPubKey(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeLAN"
                    checked={includeLAN}
                    onCheckedChange={(checked) => setIncludeLAN(checked as boolean)}
                  />
                  <Label htmlFor="includeLAN" className="cursor-pointer">
                    Incluir red LAN en configuración
                  </Label>
                </div>

                {includeLAN && (
                  <div className="space-y-2">
                    <Label htmlFor="lanNetwork-wg">Red LAN (3 primeros octetos) *</Label>
                    <Input
                      id="lanNetwork-wg"
                      placeholder="192.168.28"
                      value={lanNetwork}
                      onChange={(e) => setLanNetwork(e.target.value)}
                      required={includeLAN}
                    />
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full">
                Generar WireGuard
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="dnat" className="mt-6">
            <Alert className="bg-info/10 border-info/20 mb-6">
              <AlertDescription>
                Esta opción genera solo reglas DNAT para agregar cámaras a una configuración existente
              </AlertDescription>
            </Alert>

            <form onSubmit={handleGenerate} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clientID-dnat">ID del Cliente *</Label>
                  <Input
                    id="clientID-dnat"
                    placeholder="Ej: MC30, MC47-MONTAIN, SI07-A"
                    value={clientID}
                    onChange={(e) => setClientID(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">Formato: 2-4 letras + números + letras opcionales</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientIPSuffix-dnat">Sufijo IP WireGuard *</Label>
                  <Input
                    id="clientIPSuffix-dnat"
                    type="number"
                    placeholder="30"
                    min="1"
                    max="254"
                    value={clientIPSuffix}
                    onChange={(e) => setClientIPSuffix(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-4 p-4 border rounded-lg">
                <div className="space-y-2">
                  <Label htmlFor="cameraType-dnat">Tipo de Cámaras *</Label>
                  <Select value={cameraType} onValueChange={setCameraType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dahua">Dahua</SelectItem>
                      <SelectItem value="Hikvision">Hikvision</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="numCameras-dnat">Número de Cámaras *</Label>
                  <Input
                    id="numCameras-dnat"
                    type="number"
                    min="1"
                    max="20"
                    value={numCameras}
                    onChange={(e) => setNumCameras(parseInt(e.target.value) || 1)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>IPs de las Cámaras</Label>
                  {cameraIPs.map((ip, index) => (
                    <Input
                      key={index}
                      placeholder={`Cámara ${index + 1}: 192.168.28.101`}
                      value={ip}
                      onChange={(e) => {
                        const newIPs = [...cameraIPs];
                        newIPs[index] = e.target.value;
                        setCameraIPs(newIPs);
                      }}
                    />
                  ))}
                </div>
              </div>

              <Button type="submit" className="w-full">
                Generar DNAT
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        {showResults && configSections && (
          <div className="mt-8 space-y-6">
            {/* Resumen de Configuración */}
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5" />
                  Resumen de Configuración
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cliente:</span>
                    <span className="font-semibold text-primary">{configSections.summary.clientID}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IP WireGuard:</span>
                    <span className="font-mono">{configSections.summary.wgIP}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Interfaz:</span>
                    <span className="font-mono">{configSections.summary.interface}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Red LAN:</span>
                    <span className="font-mono">{configSections.summary.lanNetwork}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IP Router:</span>
                    <span className="font-mono">{configSections.summary.routerIP}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pool DHCP:</span>
                    <span className="font-mono text-xs">{configSections.summary.dhcpPool}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">DNS:</span>
                    <span>{configSections.summary.dns}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cámaras:</span>
                    <span>{configSections.summary.cameras}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base Puertos:</span>
                    <span className="font-mono">{configSections.summary.portBase}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Watchdog:</span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      {configSections.summary.watchdog}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sección 1: Configuración Base */}
            {configSections.base && (
              <ConfigSection
                number={1}
                title="Configuración Base (Pasos 1-6)"
                content={configSections.base}
                onCopy={() => copyToClipboard(configSections.base, "Configuración Base")}
                onDownload={() => downloadSection(configSections.base, `${clientID}-01-base.rsc`)}
              />
            )}

            {/* Sección 2: Configuración WireGuard */}
            {configSections.wireguard && (
              <ConfigSection
                number={2}
                title="Configuración WireGuard"
                content={configSections.wireguard}
                onCopy={() => copyToClipboard(configSections.wireguard, "Configuración WireGuard")}
                onDownload={() => downloadSection(configSections.wireguard, `${clientID}-02-wireguard.rsc`)}
              />
            )}

            {/* Sección 3: Configuración DNAT */}
            {configSections.dnat && (
              <ConfigSection
                number={3}
                title="Configuración DNAT para Cámaras"
                content={configSections.dnat}
                onCopy={() => copyToClipboard(configSections.dnat, "Configuración DNAT")}
                onDownload={() => downloadSection(configSections.dnat, `${clientID}-03-dnat.rsc`)}
              />
            )}

            {/* Sección 4: Scripts Watchdog */}
            <ConfigSection
              number={4}
              title="Scripts Watchdog Automático"
              content={configSections.watchdog}
              onCopy={() => copyToClipboard(configSections.watchdog, "Scripts Watchdog")}
              onDownload={() => downloadSection(configSections.watchdog, `${clientID}-04-watchdog.rsc`)}
            />

            {/* Sección 5: Comandos para Servidor */}
            <ConfigSection
              number={5}
              title="Comandos para Servidor WireGuard"
              content={configSections.serverCommands}
              onCopy={() => copyToClipboard(configSections.serverCommands, "Comandos del Servidor")}
              onDownload={() => downloadSection(configSections.serverCommands, `${clientID}-05-server.rsc`)}
            />

            {/* Sección 6: URLs de Cámaras */}
            {configSections.cameraURLs && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">6</span>
                      URLs de Acceso a Cámaras
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap">
                    {configSections.cameraURLs}
                  </pre>
                </CardContent>
              </Card>
            )}

            {/* Botón de descarga completa */}
            <div className="flex justify-center pt-4">
              <Button onClick={downloadFullConfig} size="lg" className="gap-2">
                <Download className="h-5 w-5" />
                Descargar Configuración Completa (.rsc)
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Componente auxiliar para secciones de configuración
const ConfigSection = ({ 
  number, 
  title, 
  content, 
  onCopy, 
  onDownload 
}: { 
  number: number; 
  title: string; 
  content: string; 
  onCopy: () => void; 
  onDownload: () => void; 
}) => (
  <Card>
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            {number}
          </span>
          {title}
        </CardTitle>
        <div className="flex gap-2">
          <Button onClick={onCopy} variant="default" size="sm" className="gap-2">
            <Copy className="h-4 w-4" />
            Copiar
          </Button>
          <Button onClick={onDownload} variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Descargar
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <div className="relative">
        <Button
          onClick={onCopy}
          variant="ghost"
          size="sm"
          className="absolute right-2 top-2 z-10"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <pre className="bg-slate-950 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto max-h-96 overflow-y-auto">
          {content}
        </pre>
      </div>
    </CardContent>
  </Card>
);

export default ConfigGenerator;
