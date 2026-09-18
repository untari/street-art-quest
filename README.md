# Street Art Quest - Sheung Wan

Hunt down street art hidden across Sheung Wan, Hong Kong. Open it in your browser, walk the streets, and check off what you find. No app to install, no account needed.

**[Street Art Quest](https://streetartquest.com//)**
---

## Features

| Feature | How it works |
|---|---|
| Explore or Quest mode | Explore browses every piece freely; Quest reveals one at a time, in order, and unlocks the next when you check in |
| Map | Artworks appear as coloured pins on a live map, coloured by type; your current quest glows |
| Filters | Pick any combination of artist and type from the settings sheet, each option showing how many pieces it covers, and see a live summary of your selection |
| Location precision | Choose Precise (exact GPS pin) or Approximate (a wider neighbourhood circle) for how closely your position is shown |
| Quest cards | Tap a pin, or open the quest list, for the hint, distance, and a mini-map; details stay hidden until you check in |
| Check-in | Get close and tap **Check In Here** for a GPS-verified find, paste coordinates copied from Google Maps for the same verification without granting location access, or check in without a location if you'd rather skip verification |
| Gallery | Toggle the quest list to a gallery view of everything you've found so far |
| Submit art | Spotted something new? Tap **+ Add Art** to submit it for review |

---

## Files

```
streetartquest/
├── index.html      the main map page
├── submit.html     the submission form
├── css/
│   └── style.css   all visual styles
└── js/
    ├── data.js     the curated artwork list (coordinates, hints, type, etc.)
    ├── app.js      all the logic: map, filters, quests, check-in
    └── supabase-client.js   Supabase connection used by both pages
```

---

## How artworks are added

Users submit new finds through the **+ Add Art** form. Each submission is reviewed by the curator before it appears on the map. Approved community finds show up alongside the curated list, each with its own hint once one's been written for it. The artwork list grows over time as the community spots new pieces.

---

## Submission form

Tap **+ Add Art** to open the four-step submission form. No account needed, just fill it in and submit.

1. **Photo**: required, taken on the spot or picked from your gallery
2. **Location**: guess it from GPS or drop a pin on the map yourself; can be skipped
3. **Details**: art name, artist, type, and labels, all optional, with autocomplete suggestions
4. **Review**: a summary of everything before you submit

Submissions are stored privately and reviewed before anything appears on the map.

---

## Tech

- **[Leaflet](https://leafletjs.com/)**: open source map library
- **[Carto Voyager](https://carto.com/basemaps/)**: map tiles, free with no API key
- **[Supabase](https://supabase.com/)**: open source backend for storing submissions and photos
- **Vanilla JS**: no frameworks or dependencies
- **localStorage**: saves your found artworks and settings in the browser
- **Geolocation API**: powers the live location dot, precision circle, and GPS check-in

---

## Hosting

This is a plain static site, no server, no build process. To deploy, upload the folder to any of these:

- **GitHub Pages**: free, connects directly to this repo
- **Netlify**: free, drag and drop the folder
- **Any static host**: it's just HTML, CSS, and JS
