import { redirect } from "next/navigation";

// O proxy (src/proxy.ts) já decide entre a Home e o login; isto só vale se ele não rodar.
export default function Home() {
  redirect("/clientes");
}
