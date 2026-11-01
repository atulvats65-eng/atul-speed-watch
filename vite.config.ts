import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import smmProxyPlugin from "./vite-proxy.plugin.mjs";

export default defineConfig({
  plugins: [react(), tailwindcss(), smmProxyPlugin()],
});

