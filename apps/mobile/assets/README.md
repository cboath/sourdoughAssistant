# App icon and splash: placeholder sources

**Placeholder brand** (plan Q5): a scored boule on a board in the "Crust" palette from
`docs/design/tokens.md`. When Chris supplies brand assets, replace the SVGs (keep the file names) and
re-export. Spec: `docs/design/screens-settings-onboarding.md` section 14.

## Files

| Source SVG | Export to | Size | Background | Used by |
|---|---|---|---|---|
| `icon.svg` | `icon.png` | 1024 × 1024 | Opaque `#FBF8F3`. **No alpha channel** (App Store rejects icons with alpha) | `icon` (iOS + Android legacy) |
| `adaptive-icon.svg` | `adaptive-icon.png` | 1024 × 1024 | Transparent | `android.adaptiveIcon.foregroundImage` |
| `adaptive-icon-monochrome.svg` | `adaptive-icon-monochrome.png` | 1024 × 1024 | Transparent | `android.adaptiveIcon.monochromeImage` (Android 13+ themed icons) |
| `splash-icon.svg` | `splash-icon.png` | 1024 × 1024 | Transparent | `expo-splash-screen` `image` |
| `splash-icon-dark.svg` | `splash-icon-dark.png` | 1024 × 1024 | Transparent | `expo-splash-screen` `dark.image` |
| `notification-icon.svg` | `notification-icon.png` | 96 × 96 | Transparent, white only | `expo-notifications` `icon` (Android status bar) |

Only these masters are needed. `expo prebuild` / EAS Build generate every iOS size and every Android
mipmap density from them.

## Export (macOS)

```sh
brew install librsvg imagemagick   # once
cd apps/mobile/assets

for f in icon adaptive-icon adaptive-icon-monochrome splash-icon splash-icon-dark; do
  rsvg-convert -w 1024 -h 1024 "$f.svg" -o "$f.png"
done
rsvg-convert -w 96 -h 96 notification-icon.svg -o notification-icon.png

# iOS icon must have no alpha channel: flatten onto the background color.
magick icon.png -background "#FBF8F3" -alpha remove -alpha off icon.png

# Check: icon.png should report "sRGB" with no alpha; the others "sRGBA".
magick identify -format "%f %wx%h %[channels]\n" *.png
```

Any SVG renderer that supports masks works (Inkscape CLI, Figma export at 1x). Don't use a renderer
that drops `<mask>`: the monochrome and notification icons would lose the score cut-out.

## Rules if you redraw

- **iOS icon:** square, full-bleed, opaque. Don't round the corners or add a shadow; iOS does that.
- **Adaptive foreground:** keep everything inside the central circle of radius 313 (66/108 of the
  canvas). Launchers crop to circles, squircles and teardrops, and animate the outer area.
- **Splash:** keep the glyph inside a circle of radius 341 (2/3 of the canvas). Android 12+ masks the
  splash icon to a circle. No text in the splash image: it gets clipped and doesn't scale with the
  user's text size.
- **Notification icon:** a single flat silhouette, white on transparent. Colors are ignored; Android
  tints it.
- Colors come from `tokens.ts` `palette`. If the brand palette changes, update the SVG fills to match.
- Optional later: iOS 18 dark and tinted icon variants (`ios.icon: { light, dark, tinted }`).

## Config entries (owned by whoever edits `app.config.ts`)

```ts
icon: './assets/icon.png',
android: {
  adaptiveIcon: {
    foregroundImage: './assets/adaptive-icon.png',
    monochromeImage: './assets/adaptive-icon-monochrome.png',
    backgroundColor: '#FBF8F3',
  },
},
plugins: [
  ['expo-splash-screen', {
    image: './assets/splash-icon.png',
    imageWidth: 200,
    resizeMode: 'contain',
    backgroundColor: '#FBF8F3',
    dark: { image: './assets/splash-icon-dark.png', backgroundColor: '#14110E' },
  }],
  ['expo-notifications', { icon: './assets/notification-icon.png', color: '#9A4A12' }],
],
```
