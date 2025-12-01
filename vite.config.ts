import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/",
  server: {
    host: "::",
    port: 8080,
  },
  // --- ESTE ES EL BLOQUE NUEVO QUE SOLUCIONA EL ERROR ---
  preview: {
    port: 80,
    host: true,
    allowedHosts: ["mikrotik.sts-systems.online", "vpn.sts-systems.online", "localhost"]
  },
  // -----------------------------------------------------
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
