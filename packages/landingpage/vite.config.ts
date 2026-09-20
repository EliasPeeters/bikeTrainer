import react from "@vitejs/plugin-react"
import {defineConfig} from "vite"

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        // Im Entwicklungsmodus laeuft die API daneben auf 8080. Der Proxy sorgt
        // dafuer, dass der Browser dieselbe Herkunft sieht wie spaeter hinter
        // nginx - sonst wuerde CORS lokal anders wirken als im Container.
        proxy: {
            "/api": {
                target: process.env.API_URL ?? "http://localhost:8080",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ""),
            },
        },
    },
    build: {
        outDir: "dist",
        sourcemap: true,
    },
})
