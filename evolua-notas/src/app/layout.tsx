import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Evolua Notas", description: "Solicitação, revisão e emissão de NFS-e para empresas e escritórios contábeis.",
  icons: { apple: "/icons/apple-touch-icon.png", icon: "/icons/icon-192.png" },
  appleWebApp: { capable: true, title: "Evolua", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f6b5c" };

export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
