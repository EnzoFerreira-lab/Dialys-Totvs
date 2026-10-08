import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // O assistente se chamava "Jarvis": links antigos continuam funcionando.
  redirects() {
    return [{ source: "/jarvis", destination: "/assistente", permanent: true }];
  },
  // A amostra de reuniões da TOTVS (menu Exemplo) é lida do disco em tempo de execução.
  outputFileTracingIncludes: {
    "/envio": ["./data/exemplos/**/*"],
  },
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
