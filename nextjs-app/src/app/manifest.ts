import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "S.C.D. Transport Operations",
    short_name: "SCD Transport",
    description: "ระบบบริหารงานขนส่งและคลังสินค้า",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7fb",
    theme_color: "#143d77",
    orientation: "any",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]
  };
}
