import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import fs from "fs";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const certFile = path.resolve(__dirname, "localhost.pem");
  const keyFile = path.resolve(__dirname, "localhost-key.pem");
  const hasLocalCerts = fs.existsSync(certFile) && fs.existsSync(keyFile);

  if (mode === "development" && !hasLocalCerts) {
    console.warn("[vite] HTTPS certs not found. Using HTTP. Run mkcert to enable trusted local HTTPS.");
  }

  const httpsConfig = hasLocalCerts
    ? {
        cert: fs.readFileSync(certFile),
        key: fs.readFileSync(keyFile),
      }
    : undefined;

  return {
    server: {
      host: "::",
      port: 8080,
      https: httpsConfig,
      hmr: {
        overlay: false,
      },
    },
    preview: {
      host: "::",
      port: 4173,
      https: httpsConfig,
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-router-dom",
        "@supabase/supabase-js",
        "@tanstack/react-query",
        "next-themes",
        "lucide-react",
        "sonner",
        "recharts",
        "lodash",
      ],
    },
    esbuild: {
      target: "es2020",
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      target: "es2020",
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            supabase: ["@supabase/supabase-js"],
            ui: ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-select"],
          },
        },
      },
    },
  };
});
