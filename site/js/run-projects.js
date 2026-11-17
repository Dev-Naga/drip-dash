// The Water Trail: eight real inCon-trol projects, in journey order.
// SOURCES: project names + photos from https://incontrolwatersystems.com/gallery. "seen" describes only what is
// visible in the gallery photo. "location" and "blurb" were checked against the public pages listed in "sources"
// (city sites, news, state TDLR records, landscape-architecture press) on 2026-11-17. Chase Tower's location is
// not stated anywhere we could verify, so none is given. No architects are named.
// Photos: copies of the gallery photos live in site/assets/gallery/<id>.jpg (downloaded from the gallery's
// image links on 2026-11-17, resized to 1000 px wide). The gallery link (lh3.googleusercontent.com/d/<photo>)
// is only a fallback, because Google's image host rate-limits busy pages (HTTP 429).
export const GALLERY_URL = 'https://incontrolwatersystems.com/gallery';
export const photoUrl = (id, w = 800) => `https://lh3.googleusercontent.com/d/${id}=w${w}`;
const LOCAL = Object.fromEntries(['melissa', 'epic', 'mckinney', 'olympus', 'aggie', 'arboretum', 'chase', 'agora'].map((id) => [id, `assets/gallery/${id}.jpg`]));
export const photoSources = (p, w = 1000) => [LOCAL[p.id] && new URL(`../${LOCAL[p.id]}`, import.meta.url).href, photoUrl(p.photo, w)].filter(Boolean);

export const PROJECTS = [
  {
    id: 'melissa', supply: "the splash pad", blurb: "A city park that opened in 2026; its splash pad has water slides, floor fountains and an interactive water table.", sources: ["https://cityofmelissa.com/444", "https://mckinney.preview.macaronikid.com/articles/6a35f59e5b0497d3d8589378/-melissa-lake-park-has-everything-for-a-family-day-out"], location: "Melissa, TX", name: 'Melissa Lake Park Splash Pad', short: 'Melissa Lake Park', photo: '15tKMCN-0l3iA1AuNYrJv7jmFkKvIdTrA',
    seen: 'A splash pad where a big tipping bucket dumps water over a water-tower-style play structure, with a white slide and spray features on bright, colourful surfacing.',
    story: 'Sunrise. The last drop tumbles out of the tipping bucket: Drip is on the run!',
  },
  {
    id: 'epic', supply: "the koi pond and spill basin", blurb: "A mixed-use development whose courtyard includes an interactive water feature and a koi pond.", sources: ["https://landezine-award.com/the-epic/", "https://dallasinnovates.com/epitome-of-mixed-use-old-meets-new-in-deep-ellums-the-epic-development/"], location: "Deep Ellum, Dallas, TX", name: 'The Epic East', short: 'The Epic East', photo: '1k1Wae1JRkPcvSvqYHnKN8YH-IO0FBadg',
    seen: 'A dark, angular fountain basin whose water spills over its edge into a koi pond, framed by red-orange steel columns and planters.',
    story: 'The koi pond is draining. Splash past the spill basin to keep it full.',
  },
  {
    id: 'mckinney', supply: "the steel hopper fountain", blurb: "McKinney's new city hall (opened 2025), with a public plaza planned around water features, a pavilion and lawns.", sources: ["https://dallasnews.com/news/2025/01/13/new-year-new-city-hall-mckinney-debuts-modern-headquarters-with-historic-ties", "https://dallasnews.com/news/2023/06/08/mckinneys-new-city-hall-to-be-a-gathering-space-spur-development"], location: "McKinney, TX", name: 'McKinney City Hall', short: 'McKinney City Hall', photo: '1VL9_23RU5GUjB2cRSLpJ-oODVlB_jPts',
    seen: 'A steel hopper-and-frame water feature in front of a brick and glass civic building, set in landscaped beds.',
    story: 'Civic plaza: the steel hopper feature has gone quiet. Wake it up!',
  },
  {
    id: 'olympus', supply: "the stepped cascades", blurb: "A six-storey office building in the Cypress Waters community, completed in 2022 (address: 3300 Olympus Blvd).", sources: ["https://www.tdlr.texas.gov/TABS/Projects/TABS2021017289", "https://media.billingsleyco.com/m/55498525ff06d8c3/original/CW-3300-Olympus-Brochure.pdf"], location: "Cypress Waters, Dallas, TX", name: '3300 Olympus Drive', short: '3300 Olympus Drive', photo: '1O-eGuZsf-QvGoP_DfwmGMjpLRHwt4TsJ',
    seen: 'Stepped water cascades on both sides of a striped-paver walkway, with a bronze sculpture and a row of trees.',
    story: 'Follow the stepped cascades. The water knows the way.',
  },
  {
    id: 'aggie', supply: "the pond fountains", blurb: "A 20-acre campus park that opened in 2022; the Plank Bridge crosses its central pond.", sources: ["https://aggiepark.tamu.edu/faq/", "https://www.aggienetwork.com/news/158477/aggie-park-opens-on-aandm-campus", "https://visit.cstx.gov/blog/post/college-station-welcomes-new-amenity-aggie-park/"], location: "Texas A&M University, College Station, TX", name: 'Aggie Park', short: 'Aggie Park', photo: '1LBoNwb2HjgyIEGDnf9r1OblFPN4zOgWN',
    seen: 'A pond with boulder edges and stepping stones, crossed by a pedestrian bridge, with a stadium in the background.',
    story: 'Over the bridge! The pond below is waiting for its flow.',
  },
  {
    id: 'arboretum', supply: "the water curtains", blurb: "A children's science garden that opened in 2013, designed with water as a central theme, including a 20-foot-wide waterfall.", sources: ["https://landscapearchitect.com/landscape-articles/rory-meyers-childrens-adventure-garden-dallas-arboretum", "https://dfwchild.com/taking-root/"], location: "Dallas Arboretum, Dallas, TX", name: 'Dallas Arboretum – Rory Meyers Children’s Adventure Garden', short: 'Dallas Arboretum', photo: '1q9E_8KCiE5tg-JMaQ4oNZZDpmBA27FBZ',
    seen: 'A water curtain falling from an elevated walkway into a stone-edged stream surrounded by trees.',
    story: 'Afternoon in the garden. Duck under the water curtains!',
  },
  {
    id: 'chase', supply: "the bubbler basins", blurb: "A long reflecting basin with rows of bubbler jets in front of a domed building (as shown in the gallery photo).", sources: [], name: 'Chase Tower', short: 'Chase Tower', photo: '1r0vtiLioE9jojntHFYT-75kmTDMHvCDl',
    seen: 'A long reflecting basin with rows of bubbler jets in front of a domed building.',
    story: 'Sunset downtown. One stop left, so don\'t slow down now!',
  },
  {
    id: 'agora', supply: "the evening jet show", blurb: "A splash pad that inCon-trol's gallery describes as pairing community impact with engineered efficiency for long-term water savings.", sources: ["https://incontrolwatersystems.com/gallery"], name: 'Commons at Agora', short: 'Commons at Agora', photo: '1ZjTg7sdVWgWfaJEUDxlAPrRnAGswNRdA',
    location: 'Corinth, TX',
    summary: 'inCon-trol’s gallery describes this splash pad as pairing community impact with engineered efficiency, turning everyday use into long-term water savings.',
    seen: 'Illuminated in-ground jets glowing green at dusk while kids play in the spray.',
    story: 'The destination! Light up the evening show at Commons at Agora.',
  },
];
