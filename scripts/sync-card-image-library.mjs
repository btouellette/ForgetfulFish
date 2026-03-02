#!/usr/bin/env node

import { mkdir, writeFile, access, readFile, unlink } from "node:fs/promises";
import path from "node:path";

const SCRYFALL_API_BASE = "https://api.scryfall.com";
const OUTPUT_ROOT = path.resolve(process.cwd(), "assets/card-images/library");
const MANIFEST_PATH = path.join(OUTPUT_ROOT, "manifest.json");
const INDEX_PATH = path.join(OUTPUT_ROOT, "index.json");
const IMAGE_SIZE = "large";
const REQUEST_DELAY_MS = 90;
const RETRIES = 3;
const BORDER_COLOR = "black";

const SEED_CARD_NAMES = [
  "Dandan",
  "Memory Lapse",
  "Accumulated Knowledge",
  "Brainstorm",
  "Crystal Spray",
  "Dance of the Skywise",
  "Diminishing Returns",
  "Metamorphose",
  "Mind Bend",
  "Mystical Tutor",
  "Mystic Retrieval",
  "Predict",
  "Ray of Command",
  "Supplant Form",
  "Unsubstantiate",
  "Vision Charm",
  "Izzet Boilerworks",
  "Lonely Sandbar",
  "Halimar Depths",
  "Mystic Sanctuary",
  "Remote Isle",
  "Svyelunite Temple",
  "Temple of Epiphany",
  "Island"
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const fileExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const safeCollectorNumber = (collectorNumber) =>
  collectorNumber.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const compareValues = (a, b) => {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
};

const isBlackBorderCard = (card) => card.border_color === BORDER_COLOR;

const isFullArtCard = (card) => card.full_art || card.borderless;

const getIllustrationSignature = (card) => {
  if (card.illustration_id) {
    return `single:${card.illustration_id}`;
  }

  if (Array.isArray(card.card_faces) && card.card_faces.length > 0) {
    const faceSignature = card.card_faces
      .map((face, index) => face.illustration_id ?? `face-${index + 1}-none`)
      .join("|");
    return `faces:${faceSignature}`;
  }

  return `fallback:${card.id}`;
};

const getTreatmentSignature = (card) => {
  const frameEffects = Array.isArray(card.frame_effects)
    ? [...card.frame_effects].sort().join(",")
    : "";

  return [
    card.layout,
    card.frame,
    Number(Boolean(card.borderless)),
    Number(Boolean(card.full_art)),
    Number(Boolean(card.textless)),
    frameEffects
  ].join("|");
};

const getPrintDedupeKey = (card) =>
  `${getIllustrationSignature(card)}|${getTreatmentSignature(card)}`;

const sortCollectorNumber = (card) => {
  const numeric = Number.parseInt(card.collector_number, 10);
  if (Number.isNaN(numeric)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return numeric;
};

const comparePrintPreference = (a, b) => {
  const byPromo = compareValues(Number(Boolean(a.promo)), Number(Boolean(b.promo)));
  if (byPromo !== 0) {
    return byPromo;
  }

  const bySetTypePromo = compareValues(
    Number(a.set_type === "promo"),
    Number(b.set_type === "promo")
  );
  if (bySetTypePromo !== 0) {
    return bySetTypePromo;
  }

  const bySecurityStamp = compareValues(
    Number(Boolean(a.security_stamp)),
    Number(Boolean(b.security_stamp))
  );
  if (bySecurityStamp !== 0) {
    return bySecurityStamp;
  }

  const byReleaseDate = compareValues(a.released_at ?? "", b.released_at ?? "");
  if (byReleaseDate !== 0) {
    return byReleaseDate;
  }

  const bySetCode = compareValues(a.set, b.set);
  if (bySetCode !== 0) {
    return bySetCode;
  }

  return compareValues(sortCollectorNumber(a), sortCollectorNumber(b));
};

const dedupePrintsByArtAndTreatment = (prints) => {
  const grouped = new Map();

  for (const card of prints) {
    const key = getPrintDedupeKey(card);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, card);
      continue;
    }

    if (comparePrintPreference(card, existing) < 0) {
      grouped.set(key, card);
    }
  }

  return [...grouped.values()].sort(comparePrintPreference);
};

const selectPrintsForCard = (prints) => {
  const blackBorderPrints = prints.filter(isBlackBorderCard);
  const fullArtPrints = prints.filter(isFullArtCard);

  const candidatePool = prints.filter((card) => isBlackBorderCard(card) || isFullArtCard(card));
  const deduped = dedupePrintsByArtAndTreatment(candidatePool);

  return {
    selectedPrints: deduped,
    stats: {
      total: prints.length,
      blackBorder: blackBorderPrints.length,
      fullArtAnyBorder: fullArtPrints.length,
      selectedBeforeDedupe: candidatePool.length,
      selectedAfterDedupe: deduped.length
    }
  };
};

const getFaceImages = (card) => {
  if (card.image_uris?.[IMAGE_SIZE]) {
    return [
      {
        imageUrl: card.image_uris[IMAGE_SIZE],
        faceName: null
      }
    ];
  }

  if (!Array.isArray(card.card_faces)) {
    return [];
  }

  return card.card_faces
    .map((face) => ({
      imageUrl: face.image_uris?.[IMAGE_SIZE] ?? null,
      faceName: face.name ?? null
    }))
    .filter((face) => face.imageUrl);
};

const fetchJson = async (url, attempt = 1) => {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ForgetfulFishCardImageSync/1.0",
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    if (attempt < RETRIES && response.status >= 500) {
      await sleep(REQUEST_DELAY_MS * attempt);
      return fetchJson(url, attempt + 1);
    }

    throw new Error(`Request failed ${response.status}: ${url}`);
  }

  return response.json();
};

const fetchBuffer = async (url, attempt = 1) => {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ForgetfulFishCardImageSync/1.0",
      Accept: "image/*"
    }
  });

  if (!response.ok) {
    if (attempt < RETRIES && response.status >= 500) {
      await sleep(REQUEST_DELAY_MS * attempt);
      return fetchBuffer(url, attempt + 1);
    }

    throw new Error(`Image request failed ${response.status}: ${url}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

const getCardPrints = async (cardName) => {
  const encodedQuery = new URLSearchParams({
    q: `!"${cardName}" lang:en game:paper include:extras`,
    unique: "prints",
    order: "released",
    dir: "asc"
  }).toString();

  let nextPage = `${SCRYFALL_API_BASE}/cards/search?${encodedQuery}`;
  const allPrints = [];

  while (nextPage) {
    const response = await fetchJson(nextPage);
    allPrints.push(...response.data);
    nextPage = response.has_more ? response.next_page : null;
    if (nextPage) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  return allPrints;
};

const buildRelativeImagePath = (cardFolderSlug, card, faceName, faceIndex) => {
  const releasedAt = card.released_at ?? "unknown-date";
  const setCode = card.set.toLowerCase();
  const collectorNumber = safeCollectorNumber(card.collector_number);
  const id = card.id;
  const faceSuffix =
    faceName === null ? "" : `--face-${faceIndex + 1}-${slugify(faceName) || "unnamed"}`;

  return path.join(
    cardFolderSlug,
    `${releasedAt}_${setCode}_${collectorNumber}_${id}${faceSuffix}.jpg`
  );
};

const loadPreviousManifest = async () => {
  if (!(await fileExists(MANIFEST_PATH))) {
    return null;
  }

  const raw = await readFile(MANIFEST_PATH, "utf8");
  return JSON.parse(raw);
};

const run = async () => {
  await mkdir(OUTPUT_ROOT, { recursive: true });

  const previousManifest = await loadPreviousManifest();
  const previousSet = new Set(previousManifest?.images?.map((entry) => entry.path) ?? []);

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "scryfall",
    imageSize: IMAGE_SIZE,
    selection: {
      borderColor: BORDER_COLOR,
      inclusionPolicy:
        "include prints that are black-border or full-art/borderless; exclude white/gold/silver unless full-art/borderless",
      dedupePolicy:
        "dedupe by illustration plus visual treatment; prefer non-promo/non-security-stamp prints when duplicates exist"
    },
    filters: ["lang:en", "game:paper", "include:extras", "unique:prints"],
    seedCards: SEED_CARD_NAMES,
    cardStats: [],
    images: []
  };

  let downloadedCount = 0;
  let reusedCount = 0;

  for (const cardName of SEED_CARD_NAMES) {
    const cardFolderSlug = slugify(cardName);
    const prints = await getCardPrints(cardName);
    const { selectedPrints, stats } = selectPrintsForCard(prints);

    manifest.cardStats.push({
      cardName,
      ...stats
    });

    for (const card of selectedPrints) {
      const faces = getFaceImages(card);
      for (let i = 0; i < faces.length; i += 1) {
        const face = faces[i];
        const relativePath = buildRelativeImagePath(cardFolderSlug, card, face.faceName, i);
        const absolutePath = path.join(OUTPUT_ROOT, relativePath);

        await mkdir(path.dirname(absolutePath), { recursive: true });

        const alreadyExists = await fileExists(absolutePath);
        const knownFromPreviousManifest = previousSet.has(relativePath);

        if (!alreadyExists || !knownFromPreviousManifest) {
          const buffer = await fetchBuffer(face.imageUrl);
          await writeFile(absolutePath, buffer);
          downloadedCount += 1;
          await sleep(REQUEST_DELAY_MS);
        } else {
          reusedCount += 1;
        }

        manifest.images.push({
          seedCardName: cardName,
          cardName: card.name,
          set: card.set,
          setName: card.set_name,
          borderColor: card.border_color,
          fullArt: Boolean(card.full_art),
          borderless: Boolean(card.borderless),
          promo: Boolean(card.promo),
          securityStamp: card.security_stamp ?? null,
          collectorNumber: card.collector_number,
          releasedAt: card.released_at ?? null,
          scryfallId: card.id,
          scryfallUri: card.scryfall_uri,
          faceName: face.faceName,
          path: relativePath,
          imageUrl: face.imageUrl,
          preview: Boolean(card.preview)
        });
      }
    }

    await sleep(REQUEST_DELAY_MS);
  }

  const nextPathSet = new Set(manifest.images.map((entry) => entry.path));
  for (const oldPath of previousSet) {
    if (nextPathSet.has(oldPath)) {
      continue;
    }

    const oldAbsolutePath = path.join(OUTPUT_ROOT, oldPath);
    if (await fileExists(oldAbsolutePath)) {
      await unlink(oldAbsolutePath);
    }
  }

  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const imagesBySeedCard = Object.fromEntries(SEED_CARD_NAMES.map((name) => [name, []]));
  for (const image of manifest.images) {
    imagesBySeedCard[image.seedCardName].push(image.path);
  }

  const index = {
    generatedAt: manifest.generatedAt,
    sourceManifest: "manifest.json",
    totalImages: manifest.images.length,
    cards: SEED_CARD_NAMES.map((name) => ({
      cardName: name,
      slug: slugify(name),
      count: imagesBySeedCard[name].length,
      images: imagesBySeedCard[name]
    }))
  };

  await writeFile(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`, "utf8");

  const totalCount = manifest.images.length;
  console.log(
    `Done. ${totalCount} images tracked (${downloadedCount} downloaded, ${reusedCount} reused).`
  );
  console.log(`Manifest: ${MANIFEST_PATH}`);
  console.log(`Index: ${INDEX_PATH}`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
