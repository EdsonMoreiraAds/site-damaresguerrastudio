import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Evolua Notas", short_name: "Evolua", description: "Solicite, revise e aprove NFS-e de qualquer dispositivo.",
    start_url: "/notas", scope: "/", display: "standalone", orientation: "portrait", lang: "pt-BR",
    background_color: "#0f6b5c", theme_color: "#0f6b5c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
