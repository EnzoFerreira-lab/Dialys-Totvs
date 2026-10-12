import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // `npm run dev` aberto pelo IP da rede local (o endereço "Network", ex.: celular ou outro computador na
  // apresentação): sem isto o Next bloqueia os arquivos de desenvolvimento e a página fica sem interação.
  // 26.*: Radmin VPN, que o Next às vezes mostra como "Network" no lugar do IP da rede.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "26.*.*.*", "*.local"],
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
