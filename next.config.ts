import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // O assistente se chamava "Jarvis": links antigos continuam funcionando.
  redirects() {
    return [{ source: "/jarvis", destination: "/assistente", permanent: true }];
  },
  // A amostra de reuniões da TOTVS é lida do disco em tempo de execução: no menu Exemplo do /envio e,
  // em todas as telas e rotas da API, para dar nome aos clientes (src/server/clientes/identificacao.ts).
  outputFileTracingIncludes: {
    "/**": ["./data/exemplos/**/*"],
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
