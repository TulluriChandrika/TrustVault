import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(import.meta.dirname, "../../");
  const env = loadEnv(mode, rootDir, "");

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
  const apiUrl = env.VITE_API_URL || "";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    envDir: rootDir,
    define: {
      ...(supabaseUrl ? { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl) } : {}),
      ...(supabaseAnonKey ? { "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabaseAnonKey) } : {}),
      ...(apiUrl ? { "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl) } : {}),
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:4000",
          changeOrigin: true,
        },
        "/health": {
          target: "http://127.0.0.1:4000",
          changeOrigin: true,
        },
      },
    },
  };
});

