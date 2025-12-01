import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import ConfigGenerator from "@/components/ConfigGenerator";
import MonitorEnlaces from "@/components/MonitorEnlaces";

const Dashboard = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const isAuthenticated = localStorage.getItem("isAuthenticated");
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img src="/favicon.png" alt="Axend Logo" className="h-10 w-auto" />
            <h1 className="text-2xl font-bold text-foreground">
              Sistema MikroTik - Dashboard
            </h1>
          </div>
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            Cerrar Sesión
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="generator" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generator">Generador Config</TabsTrigger>
            <TabsTrigger value="monitor">Monitor Enlaces</TabsTrigger>
          </TabsList>
          
          <TabsContent value="generator" className="mt-6">
            <ConfigGenerator />
          </TabsContent>
          
          <TabsContent value="monitor" className="mt-6">
            <MonitorEnlaces />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;
