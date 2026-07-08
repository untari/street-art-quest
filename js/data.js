const ARTWORKS = [
  {
    id: 1,
    title: "Blue Elephant",
    artist: "Caratoes",
    type: "Mural",
    lat: 22.2836, lng: 114.1501,
    photo: "",
    commissioned: true,
    address: "Hollywood Road, Sheung Wan",
    hint: "A vivid blue elephant watches over the street from an old tong lau. You're close to a famous Taoist temple.",

    radius: 60
  },
  {
    id: 2,
    title: "Space Invader HK_42",
    artist: "Invader",
    type: "Installation",
    lat: 22.2839, lng: 114.1508,
    photo: "",
    commissioned: false,
    address: "Hollywood Road, Sheung Wan",
    hint: "A pixelated alien mosaic clings to the wall. The Paris-based artist always hides his tiles just above eye level.",

    radius: 40
  },
  {
    id: 3,
    title: "Golden Tiger",
    artist: "Bao Ho",
    type: "Mural",
    lat: 22.2828, lng: 114.1510,
    photo: "",
    commissioned: true,
    address: "PMQ, Aberdeen Street, Sheung Wan",
    hint: "A golden tiger climbs the wall of a converted police barracks turned creative hub. Look for the arched windows.",

    radius: 60
  },
  {
    id: 4,
    title: "Stairway Koi",
    artist: "Unknown",
    type: "Paste-up",
    lat: 22.2843, lng: 114.1495,
    photo: "",
    commissioned: false,
    address: "Ladder Street, Sheung Wan",
    hint: "Giant koi fish swim up the walls of a long stone staircase. Start at the bottom and follow them up.",

    radius: 50
  },
  {
    id: 5,
    title: "Red Phoenix Series",
    artist: "XEME",
    type: "Sticker",
    lat: 22.2850, lng: 114.1476,
    photo: "",
    commissioned: false,
    address: "Possession Street, Sheung Wan",
    hint: "Red phoenix stickers scattered across the lane where the British first planted their flag in Hong Kong in 1841.",

    radius: 50
  },
  {
    id: 6,
    title: "Grandmother",
    artist: "Katol",
    type: "Installation",
    lat: 22.2820, lng: 114.1520,
    photo: "",
    commissioned: true,
    address: "Gough Street, Sheung Wan",
    hint: "A neon elderly woman plays mahjong in a narrow alley. Blink and you'll walk right past her.",

    radius: 40
  },
  {
    id: 7,
    title: "Dragon Ascending",
    artist: "Silas Kam",
    type: "Mural",
    lat: 22.2848, lng: 114.1480,
    photo: "",
    commissioned: true,
    address: "Tai Ping Shan Street, Sheung Wan",
    hint: "A golden dragon spirals upward across three storeys of a tenement. Follow the incense smoke from the nearby temple.",

    radius: 60
  },
  {
    id: 8,
    title: "Fortune Door",
    artist: "Signal8",
    type: "Paste-up",
    lat: 22.2841, lng: 114.1488,
    photo: "",
    commissioned: false,
    address: "Upper Lascar Row (Cat Street), Sheung Wan",
    hint: "A trompe-l'oeil lucky door pasted onto a real wall on the antique dealers' street. Which door leads nowhere?",

    radius: 50
  },
  {
    id: 9,
    title: "Neon Dim Sum",
    artist: "Mr. Zeh",
    type: "Installation",
    lat: 22.2853, lng: 114.1479,
    photo: "",
    commissioned: false,
    address: "Po Yan Street, Sheung Wan",
    hint: "Glowing har gow and siu mai hang from a rusted gate between two tenements. Look for the pink glow.",

    radius: 45
  },
  {
    id: 10,
    title: "Bamboo Giant",
    artist: "Bao Ho",
    type: "Mural",
    lat: 22.2832, lng: 114.1517,
    photo: "",
    commissioned: true,
    address: "Aberdeen Street, Sheung Wan",
    hint: "A life-sized panda wrapped in bamboo towers over an alley entrance south of the old police quarters.",

    radius: 55
  },
  {
    id: 11,
    title: "Mahjong Ladies",
    artist: "Caratoes",
    type: "Mural",
    lat: 22.2822, lng: 114.1526,
    photo: "",
    commissioned: false,
    address: "Gough Street, Sheung Wan",
    hint: "Four cartoon grandmothers in bold flat colour, deep in a game on a whitewashed ground-floor wall.",

    radius: 50
  },
  {
    id: 12,
    title: "Tram Dreams",
    artist: "Unknown",
    type: "Paste-up",
    lat: 22.2875, lng: 114.1500,
    photo: "",
    commissioned: false,
    address: "Des Voeux Road West, Sheung Wan",
    hint: "A life-size wheatpaste of a 1950s tram conductor, frozen in time on the wall behind a live tram stop.",

    radius: 55
  },
  {
    id: 13,
    title: "The Herbalist",
    artist: "Silas Kam",
    type: "Mural",
    lat: 22.2857, lng: 114.1530,
    photo: "",
    commissioned: true,
    address: "Queen's Road West, Sheung Wan",
    hint: "An old Chinese herbalist painted floor-to-ceiling beside a row of medicine drawers. The shop next door still sells the real thing.",

    radius: 60
  },
  {
    id: 14,
    title: "Lion Rock Spirit",
    artist: "Signal8",
    type: "Mural",
    lat: 22.2868, lng: 114.1522,
    photo: "",
    commissioned: false,
    address: "Wing Lok Street, Sheung Wan",
    hint: "The Lion Rock skyline silhouetted in neon yellow across a roll-down shutter on the dried-seafood street.",

    radius: 55
  },
  {
    id: 15,
    title: "Paper Ancestor",
    artist: "Unknown",
    type: "Paste-up",
    lat: 22.2863, lng: 114.1508,
    photo: "",
    commissioned: false,
    address: "Bonham Strand, Sheung Wan",
    hint: "A Qing-dynasty figure made from layered joss paper, pasted beside a traditional offerings shop.",

    radius: 50
  },
  {
    id: 16,
    title: "Goldfish Boy",
    artist: "Mr. Zeh",
    type: "Mural",
    lat: 22.2871, lng: 114.1498,
    photo: "",
    commissioned: false,
    address: "Jervois Street, Sheung Wan",
    hint: "A wide-eyed boy peers from behind an oversized goldfish bowl on a loading-bay wall near the waterfront.",

    radius: 50
  },
  {
    id: 17,
    title: "Fish Market Blues",
    artist: "Katol",
    type: "Mural",
    lat: 22.2878, lng: 114.1512,
    photo: "",
    commissioned: true,
    address: "Des Voeux Road West, Sheung Wan",
    hint: "A sweeping mural of fishmongers at dawn, painted across a loading bay opposite the dried-seafood wholesalers.",

    radius: 60
  },
  {
    id: 18,
    title: "Colonial Echo",
    artist: "XEME",
    type: "Sculpture",
    lat: 22.2851, lng: 114.1472,
    photo: "",
    commissioned: false,
    address: "Possession Street, Sheung Wan",
    hint: "A miniature bronze hand clutching a flag, wedged into a wall crack at the street where Hong Kong's colonial history began.",

    radius: 35
  },
  {
    id: 19,
    title: "Temple Cats",
    artist: "Caratoes",
    type: "Paste-up",
    lat: 22.2837, lng: 114.1490,
    photo: "",
    commissioned: false,
    address: "Tai Ping Shan Street, Sheung Wan",
    hint: "Three oversized cats with incense-stick tails, pasted on the lane wall directly opposite a neighbourhood temple.",

    radius: 45
  },
  {
    id: 20,
    title: "Stack",
    artist: "Bao Ho",
    type: "Sculpture",
    lat: 22.2824, lng: 114.1532,
    photo: "",
    commissioned: true,
    address: "Gough Lane, Sheung Wan",
    hint: "Seven ceramic bowls stacked impossibly high on a window ledge at the end of a dead-end lane. They're fixed — but try not to test it.",

    radius: 35
  }
];
