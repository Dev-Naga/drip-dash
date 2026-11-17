// The Water Trail: eight real inCon-trol projects, in journey order.
// SOURCE: https://incontrolwatersystems.com/gallery (project names and photos). The gallery does not list
// architects, dates or descriptions, so none are given here. "seen" describes only what is visible in the
// gallery photo. Only Commons at Agora has a published location and summary (gallery case-study teaser).
// Photos: copies of the gallery photos live in site/assets/gallery/<id>.jpg (downloaded from the gallery's
// image links on 2026-11-17, resized to 1000 px wide). The gallery link (lh3.googleusercontent.com/d/<photo>)
// is only a fallback, because Google's image host rate-limits busy pages (HTTP 429).
export const GALLERY_URL = 'https://incontrolwatersystems.com/gallery';
export const photoUrl = (id, w = 800) => `https://lh3.googleusercontent.com/d/${id}=w${w}`;
const LOCAL = Object.fromEntries(['melissa', 'epic', 'mckinney', 'olympus', 'aggie', 'arboretum', 'chase', 'agora'].map((id) => [id, `assets/gallery/${id}.jpg`]));
export const photoSources = (p, w = 1000) => [LOCAL[p.id] && new URL(`../${LOCAL[p.id]}`, import.meta.url).href, photoUrl(p.photo, w)].filter(Boolean);

export const PROJECTS = [
  {
    id: 'melissa', name: 'Melissa Lake Park Splash Pad', short: 'Melissa Lake Park', photo: '15tKMCN-0l3iA1AuNYrJv7jmFkKvIdTrA',
    seen: 'A splash pad where a big tipping bucket dumps water over a water-tower-style play structure, with a white slide and spray features on bright, colourful surfacing.',
    story: 'Sunrise. The last drop tumbles out of the tipping bucket: Drip is on the run!',
  },
  {
    id: 'epic', name: 'The Epic East', short: 'The Epic East', photo: '1k1Wae1JRkPcvSvqYHnKN8YH-IO0FBadg',
    seen: 'A dark, angular fountain basin whose water spills over its edge into a koi pond, framed by red-orange steel columns and planters.',
    story: 'The koi pond is draining. Splash past the spill basin to keep it full.',
  },
  {
    id: 'mckinney', name: 'McKinney City Hall', short: 'McKinney City Hall', photo: '1VL9_23RU5GUjB2cRSLpJ-oODVlB_jPts',
    seen: 'A steel hopper-and-frame water feature in front of a brick and glass civic building, set in landscaped beds.',
    story: 'Civic plaza: the steel hopper feature has gone quiet. Wake it up!',
  },
  {
    id: 'olympus', name: '3300 Olympus Drive', short: '3300 Olympus Drive', photo: '1O-eGuZsf-QvGoP_DfwmGMjpLRHwt4TsJ',
    seen: 'Stepped water cascades on both sides of a striped-paver walkway, with a bronze sculpture and a row of trees.',
    story: 'Follow the stepped cascades. The water knows the way.',
  },
  {
    id: 'aggie', name: 'Aggie Park', short: 'Aggie Park', photo: '1LBoNwb2HjgyIEGDnf9r1OblFPN4zOgWN',
    seen: 'A pond with boulder edges and stepping stones, crossed by a pedestrian bridge, with a stadium in the background.',
    story: 'Over the bridge! The pond below is waiting for its flow.',
  },
  {
    id: 'arboretum', name: 'Dallas Arboretum – Rory Meyers Children’s Adventure Garden', short: 'Dallas Arboretum', photo: '1q9E_8KCiE5tg-JMaQ4oNZZDpmBA27FBZ',
    seen: 'A water curtain falling from an elevated walkway into a stone-edged stream surrounded by trees.',
    story: 'Afternoon in the garden. Duck under the water curtains!',
  },
  {
    id: 'chase', name: 'Chase Tower', short: 'Chase Tower', photo: '1r0vtiLioE9jojntHFYT-75kmTDMHvCDl',
    seen: 'A long reflecting basin with rows of bubbler jets in front of a domed building.',
    story: 'Sunset downtown. One stop left, so don\'t slow down now!',
  },
  {
    id: 'agora', name: 'Commons at Agora', short: 'Commons at Agora', photo: '1ZjTg7sdVWgWfaJEUDxlAPrRnAGswNRdA',
    location: 'Corinth, TX',
    summary: 'inCon-trol’s gallery describes this splash pad as pairing community impact with engineered efficiency, turning everyday use into long-term water savings.',
    seen: 'Illuminated in-ground jets glowing green at dusk while kids play in the spray.',
    story: 'The destination! Light up the evening show at Commons at Agora.',
  },
];
