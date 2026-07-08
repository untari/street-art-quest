# Street Art Quest — Sheung Wan

Hunt down street art hidden across Sheung Wan, Hong Kong. Open it in your browser, walk the streets, and check off what you find. No app to install, no account needed.

---

## Features

| Feature | How it works |
|---|---|
| Map | All artworks appear as coloured dots on a live map |
| Filters | Tap All / Mural / Sculpture / Paste-up / Sticker / Installation to narrow the view |
| Artwork info | Tap any dot to see the title, artist, address, and type |
| Quest mode | Tap **QUESTS** for a checklist with hints — details stay hidden until you find it |
| GPS check-in | Get close enough to an artwork and tap **I'm here** to mark it found |
| Live location | Tap the crosshair button (bottom right) to see yourself on the map |
| Submit art | Spotted something new? Tap **+ Add Art** to submit it for review |

---

## Files

```
streetartquest/
├── index.html      — the main map page
├── submit.html     — the submission form
├── css/
│   └── style.css   — all visual styles
└── js/
    ├── data.js     — list of artworks (coordinates, hints, type, etc.)
    └── app.js      — all the logic: map, markers, quests, GPS
```

---

## How artworks are added

Users submit new finds through the **+ Add Art** form. Each submission is reviewed by the curator before it appears on the map. The artwork list grows over time as the community spots new pieces.

---

## Submission form

The form (`submit.html`) collects:
- Title and artist name
- Artist Instagram handle
- Type of artwork
- Street address
- Google Maps link (for exact coordinates)
- Photo URL
- Whether it's commissioned or unsanctioned

Submissions go to the repo owner via GitHub Issues for review.

---

## Tech

- **[Leaflet](https://leafletjs.com/)** — open source map library
- **[Carto Voyager](https://carto.com/basemaps/)** — map tiles, free with no API key
- **Vanilla JS** — no frameworks or dependencies
- **localStorage** — saves your found artworks in the browser
- **Geolocation API** — powers the live location dot and GPS check-in

---

## Hosting

This is a plain static site — no server, no build process. To deploy, upload the folder to any of these:

- **GitHub Pages** — free, connects directly to this repo
- **Netlify** — free, drag and drop the folder
- **Any static host** — it's just HTML, CSS, and JS
