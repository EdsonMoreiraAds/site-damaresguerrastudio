import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Evolua Notas", description: "Solicitação, revisão e emissão de NFS-e para empresas e escritórios contábeis." };

export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
