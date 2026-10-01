import type { MetadataRoute } from "next";

// Lets the gabbai (and congregants) add the site to the home screen – no app store needed.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ניהול נדרים לבית הכנסת",
    short_name: "נדרים",
    description: "ניהול נדרים, תשלומים ותזכורות",
    lang: "he",
    dir: "rtl",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#1b2b58",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
