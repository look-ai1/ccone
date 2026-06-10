import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "省多多",
    short_name: "省多多",
    start_url: "/tablet",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: []
  };
}
