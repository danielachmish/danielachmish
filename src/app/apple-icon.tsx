import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// PNG home-screen icon for iOS (which ignores SVG icons).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #2b4ea8, #111a37)", color: "#e7c46c", fontSize: 96, fontWeight: 700 }}>
        ✡
      </div>
    ),
    size,
  );
}
