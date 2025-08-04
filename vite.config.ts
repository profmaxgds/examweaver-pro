import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs"; // <--- IMPORTANTE!
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0", // ← garante que o iPhone possa acessar pelo IP
    port: 8080,
    https: {
      key: fs.readFileSync("./ssl-cert/key.pem"),
      cert: fs.readFileSync("./ssl-cert/cert.pem"),
    },
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
