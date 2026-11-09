---
name: media-production
description: Producing videos, animations, GIFs, images, banners, social posts, thumbnails, and product demo recordings. Use whenever the user asks for a video, clip, animation, image, graphic, or visual asset.
---

# Media Production

I have no built-in image/video generation model. I produce media **through code**, and say so when an AI-generated photo-real look is really needed (then propose an external API; key via `request_credential`).

## Tools available in the sandbox
`ffmpeg`, ImageMagick (`convert`), Python + Pillow, Node 22, Playwright + Chromium. Check others with `which` before relying on them.

## Recipes
- **Image / banner / social post**: HTML+CSS (or SVG) → Playwright screenshot at deviceScaleFactor 2 → PNG. Hebrew text works natively in the browser.
- **Logo / icon**: SVG by hand → PNG sizes via `convert`.
- **Animated video (motion graphics, explainer, promo)**: HTML/CSS/JS animation driven by a time variable → Playwright captures frames (or `page.video`) → `ffmpeg -framerate 30 -i f_%04d.png -c:v libx264 -pix_fmt yuv420p out.mp4`. Remotion (`npx create-video@latest`) for bigger/templated projects. Tested recipe below.
- **Product demo of an app**: Playwright script with `recordVideo` clicking through the flow → ffmpeg trim/convert (webm→mp4, add title cards).
- **GIF**: ffmpeg palettegen/paletteuse for quality.
- **Slideshow from images + music**: ffmpeg concat + `-shortest`; add text as pre-rendered transparent PNG overlays from HTML (ffmpeg `drawtext` does NOT shape Hebrew/RTL correctly – avoid it for Hebrew).
- **Audio / voice-over**: no TTS built in → user's recording, or external TTS API (ElevenLabs etc., key via `request_credential`). Background music: only user-provided or royalty-free with license noted.
- **Stock photos/footage**: only with a clear license (user's assets, Unsplash/Pexels API); never scrape images.
- **Charts as images**: `dataviz` rules, render via browser.

## Formats
Social: 1080×1080 (post), 1080×1920 (story/reel), 1920×1080 (YouTube). mp4 H.264 + yuv420p for compatibility.

## Verify & deliver
Extract 2–3 frames (`ffmpeg -ss t -frames:v 1`) and look at them before delivering. Save in working dir or scratchpad; send with `SendUserFile`.

## Tested pipeline (HTML animation → mp4, Hebrew OK – verified 2026-11)
1. HTML page exposing `window.render(t)` (frame at `t` seconds). Load a Google Font (Heebo/Rubik) – the script waits for `document.fonts.ready`.
2. `node <skill-dir>/scripts/render-frames.cjs page.html <sec> <w> <h> [fps=30] [outDir]` (CommonJS on purpose: ESM `import 'playwright'` fails outside a project). ~450 frames (15s) ≈ 35–60s (measured ~13 fps at 1080×1920).
3. `ffmpeg -y -framerate 30 -i <outDir>/f_%04d.png -c:v libx264 -pix_fmt yuv420p out.mp4`
4. Music: `ffmpeg -i out.mp4 -i music.mp3 -c:v copy -af "afade=t=out:st=<len-1.5>:d=1.5" -shortest final.mp4`.
5. Check frames at start/middle/end (`ffmpeg -ss <t> -i out.mp4 -frames:v 1 -vf scale=360:-1 f.png`) and look.

## Promo / ad video rules
- Questions (with defaults): brand name/logo/colors, the offer + dates, format, music.
- Structure for 15s: hook 0–3s · offer 3–9s · product/visual 9–13s · end card (logo, CTA, dates) 13–15s. Each text beat ≥ 2s on screen, ≤ 7 words.
- Designed to work muted (most feeds autoplay silent): all info in on-screen text.
- 9:16 safe area: keep text out of top ~250px and bottom ~300px (UI overlays).
- Export main format + 1:1 variant when cheap (re-render with other w/h; layout must be responsive).
- Copy from `writing-content`, look from `visual-design`.
