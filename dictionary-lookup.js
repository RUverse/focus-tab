// Network lookups for the dictionary gadget. Only the text the user submits is
// sent: words to Wiktionary, and phrases to the browser's on-device translator
// or, where that is unavailable, the MyMemory translation API. English lookups
// only use English Wiktionary.
import {
  DICTIONARY_DATA_COLLECTION,
  DICTIONARY_DEFINITIONS_MAX,
  DICTIONARY_DEFINITION_MAX_CHARS,
  DICTIONARY_TERM_MAX_CHARS
} from "./shared.js";

const REQUEST_TIMEOUT_MS = 8000;
// How long to wait for an installed on-device model before falling back.
const ON_DEVICE_WAIT_MS = 4000;
// Checking for a model is normally instant; don't let a stuck check delay lookups.
const AVAILABILITY_WAIT_MS = 1000;
// Wiktionary has entries for words and short set phrases ("guten Morgen").
const DICTIONARY_MAX_WORDS = 3;
const DICTIONARY_MAX_CHARS = 60;
const GLOSSES_MAX = 3;
const GLOSS_MAX_CHARS = 80;
const MYMEMORY_MAX_BYTES = 500;
// Wikimedia asks browser clients to identify themselves with this header.
const WIKIMEDIA_HEADERS = { "Api-User-Agent": "FocusTab (https://github.com/RUverse/focus-tab)" };

// Where each Wiktionary edition starts the section for its own language, where
// the next language section starts, and how its definition lines are written.
const EDITIONS = {
  de: { start: /^==[^=].*\{\{Sprache\|Deutsch\}\}.*==\s*$/, next: /^==[^=]/, style: "bedeutungen" },
  fr: { start: /^==\s*\{\{langue\|fr\}\}\s*==\s*$/, next: /^==[^=]/, style: "hash" },
  es: { start: /^==\s*\{\{lengua\|es\}\}\s*==\s*$/, next: /^==[^=]/, style: "numbered" },
  it: { start: /^==\s*\{\{-it-\}\}\s*==\s*$/, next: /^==[^=]/, style: "hash" },
  nl: { start: /^\{\{=nld=\}\}\s*$/, next: /^\{\{=[a-z-]+=\}\}\s*$/, style: "hash" },
  pt: { start: /^=\s*\{\{-pt-\}\}\s*=\s*$/, next: /^=[^=]/, style: "hash" }
};

const MEDIA_LINK = /^\s*:?\s*(file|image|imagem|archivo|afbeelding|datei|bild|fichier|media|category|categoría|categoria|categorie|catégorie|kategorie)\s*:/i;
// Link-like templates whose first argument is display text; others are labels.
const TEXT_TEMPLATES = new Set(["l", "lien", "link", "w", "lang"]);

// Text fallback for senses such as "plural of Haus" when the markup has no
// form-of class.
const FORM_OF = /\b(inflection|plural|singular|participle|imperative|preterite|gerund|form|spelling)\b[^;]*\bof [^\s:;]+(:|\s*$)/i;

const MESSAGES = {
  empty: "Type a word or phrase first.",
  offline: "You're offline. Try again once you're connected.",
  unavailable: "The dictionary isn't responding right now. Try again later.",
  "not-found": "No translation found. Check the spelling or language.",
  "no-definition": "No English definition found. Check the spelling, or try a single word.",
  quota: "The translation service's daily limit is used up. Try again tomorrow.",
  "too-long": "That's too long to translate. Try a shorter phrase.",
  consent: "Lookups need your permission to send the word to Wiktionary or a translation service."
};

// Firefox asks users before an add-on sends what they type to other services.
// Resolves to "unsupported" where the browser has no such consent (Chrome),
// otherwise "granted" or "missing".
export async function readLookupConsent(permissions) {
  try {
    const all = await permissions?.getAll?.();
    if (!Array.isArray(all?.data_collection)) {
      return "unsupported";
    }
    return all.data_collection.includes(DICTIONARY_DATA_COLLECTION) ? "granted" : "missing";
  } catch {
    return "unsupported";
  }
}

// Shows Firefox's consent prompt. Call it directly from the user's submit,
// before any await, or Firefox refuses to show the prompt.
export async function requestLookupConsent(permissions) {
  try {
    return Boolean(await permissions.request({ data_collection: [DICTIONARY_DATA_COLLECTION] }));
  } catch {
    return false;
  }
}

export class LookupError extends Error {
  constructor(code) {
    super(MESSAGES[code] || MESSAGES.unavailable);
    this.name = "LookupError";
    this.code = code;
  }
}

/**
 * Look up `input` in `lang` and resolve to a history entry
 * ({ lang, term, translation, definitions, source, at }) or throw LookupError.
 */
export async function lookupTerm(input, lang, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
  const text = String(input ?? "").replace(/\s+/g, " ").trim().slice(0, DICTIONARY_TERM_MAX_CHARS);
  if (!text) {
    throw new LookupError("empty");
  }

  const now = options.now ?? Date.now();
  if (lang === "en") {
    return lookupEnglish(text, fetchImpl, now);
  }

  let english = null;
  let native = null;
  if (isDictionaryCandidate(text)) {
    [english, native] = await Promise.all([
      findEnglishGlosses(titleVariants(text), lang, fetchImpl).catch(() => null),
      findNativeDefinitions(text, lang, fetchImpl).catch(() => null)
    ]);
    // The native edition settles the lemma ("haus" → "Haus"), so describe that
    // page rather than a different English entry ("haus", a form of hausen).
    if (native && native.title !== english?.title) {
      english = await findEnglishGlosses([native.title], lang, fetchImpl).catch(() => null) || english;
    }
  }

  const entry = {
    lang,
    term: native?.title || english?.title || text,
    definitions: native?.definitions || [],
    at: now
  };

  if (english) {
    return { ...entry, translation: english.glosses.join("; "), source: "wiktionary" };
  }

  const translated = await translateText(text, lang, { fetchImpl, translatorApi: options.translatorApi });
  // Translators echo text they don't recognize ("xqzvbn"). Without a dictionary
  // entry either, treat that as not found.
  if (!native && sameText(translated.translation, text)) {
    throw new LookupError("not-found");
  }
  return { ...entry, ...translated };
}

// English has nothing to translate: its own Wiktionary entry gives the parts
// of speech, shown where other languages show the translation, and definitions.
async function lookupEnglish(text, fetchImpl, now) {
  let found = null;
  if (isDictionaryCandidate(text)) {
    try {
      found = await findEnglishDefinitions(titleVariants(text), fetchImpl);
    } catch {
      throw new LookupError(isOffline() ? "offline" : "unavailable");
    }
  }
  if (!found) {
    throw new LookupError("no-definition");
  }
  return {
    lang: "en",
    term: found.title,
    translation: found.partsOfSpeech.join(", "),
    definitions: found.definitions,
    source: "wiktionary",
    at: now
  };
}

function sameText(a, b) {
  const simplify = (value) => value.toLocaleLowerCase().replace(/[\s.,!?;:'"«»„“”¿¡]+/g, "");
  return simplify(a) === simplify(b);
}

export function isDictionaryCandidate(text) {
  return text.length <= DICTIONARY_MAX_CHARS && text.split(" ").length <= DICTIONARY_MAX_WORDS;
}

// Wiktionary titles are case-sensitive: try the text as typed, then with a
// capital first letter (German nouns), then lowercase.
export function titleVariants(text) {
  const capitalized = text.charAt(0).toLocaleUpperCase() + text.slice(1);
  return [...new Set([text, capitalized, text.toLocaleLowerCase()])];
}

function englishDefinitionUrl(title) {
  return `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

async function findEnglishGlosses(titles, lang, fetchImpl) {
  for (const title of titles) {
    const glosses = parseEnglishGlosses(await getJson(englishDefinitionUrl(title), fetchImpl, WIKIMEDIA_HEADERS), lang);
    if (glosses.length) {
      return { title, glosses };
    }
  }
  return null;
}

async function findEnglishDefinitions(titles, fetchImpl) {
  for (const title of titles) {
    const found = parseEnglishDefinitions(await getJson(englishDefinitionUrl(title), fetchImpl, WIKIMEDIA_HEADERS));
    if (found.definitions.length) {
      return { title, ...found };
    }
  }
  return null;
}

async function findNativeDefinitions(text, lang, fetchImpl) {
  for (const title of titleVariants(text)) {
    const params = new URLSearchParams({
      action: "parse", page: title, prop: "wikitext", redirects: "1",
      format: "json", formatversion: "2", origin: "*"
    });
    const data = await getJson(`https://${lang}.wiktionary.org/w/api.php?${params}`, fetchImpl, WIKIMEDIA_HEADERS);
    const page = data?.parse;
    const definitions = page ? parseNativeDefinitions(lang, page.wikitext, page.title || title) : [];
    if (definitions.length) {
      return { title: page.title || title, definitions };
    }
  }
  return null;
}

async function getJson(url, fetchImpl, headers = {}) {
  const response = await fetchImpl(url, {
    headers,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

// English Wiktionary describes foreign words with short English glosses, which
// serve as the translation. Take each part of speech's leading senses first,
// and skip "inflection of …" senses unless the word has nothing else.
export function parseEnglishGlosses(json, lang) {
  // Place names and surnames ("Haus, a municipality of Styria") only when the
  // word has no ordinary entry.
  const sections = preferredSections(json?.[lang], /proper noun/i);
  const lists = withoutFormOf(sections.map((section) => sectionSenses(section, readGloss)));
  // One gloss may list several senses ("to walk; to jog; to run").
  return interleave(lists, GLOSSES_MAX, (gloss) => gloss.text.split(";")).map(({ text }) => text);
}

// English words get full definitions and the parts of speech they come from.
export function parseEnglishDefinitions(json) {
  // Skip "RUN, ISO 639-2 code for Rundi" and similar unless that is all.
  const sections = preferredSections(json?.en, /proper noun|symbol|letter|abbreviation|initialism|acronym/i);
  const lists = withoutFormOf(sections.map((section) => sectionSenses(section, readDefinition)
    .map((sense) => ({ ...sense, partOfSpeech: String(section?.partOfSpeech || "").trim().toLocaleLowerCase() }))));
  const picked = interleave(lists, DICTIONARY_DEFINITIONS_MAX, (sense) => [sense.text]);
  return {
    definitions: picked.map(({ text }) => text),
    partsOfSpeech: [...new Set(picked.map(({ sense }) => sense.partOfSpeech).filter(Boolean))]
  };
}

function preferredSections(entries, skip) {
  const sections = Array.isArray(entries) ? entries : [];
  const common = sections.filter((entry) => !skip.test(entry?.partOfSpeech || ""));
  return common.length ? common : sections;
}

function sectionSenses(section, read) {
  return (Array.isArray(section?.definitions) ? section.definitions : [])
    .map((definition) => read(definition?.definition))
    .filter((sense) => sense.text);
}

function withoutFormOf(lists) {
  const senses = lists.map((list) => list.filter((sense) => !sense.formOf));
  return senses.some((list) => list.length) ? senses : lists;
}

// Take the first sense of every part of speech, then the second, and so on,
// skipping repeats, until `max` texts are picked.
function interleave(lists, max, split) {
  const picked = [];
  const seen = new Set();
  for (let index = 0; picked.length < max && lists.some((list) => index < list.length); index += 1) {
    for (const list of lists) {
      const sense = list[index];
      for (const part of sense ? split(sense) : []) {
        const text = part.trim();
        if (text && !seen.has(text.toLocaleLowerCase()) && picked.length < max) {
          seen.add(text.toLocaleLowerCase());
          picked.push({ text, sense });
        }
      }
    }
  }
  return picked;
}

// Nested lists hold sub-senses and the detail of form-of entries.
function leadMarkup(html) {
  return String(html ?? "").replace(/<(ol|ul|dl)\b[\s\S]*$/i, "");
}

function isFormOf(markup, text) {
  return /form-of-definition/.test(markup) || FORM_OF.test(text);
}

function readGloss(html) {
  const markup = leadMarkup(html);
  const text = htmlToText(markup);
  // Drop usage labels and notes such as "(transitive)" or "[auxiliary avere]",
  // unless that is all there is.
  const withoutNotes = text
    .replace(/\s*\([^()]*\)|\s*\[[^[\]]*\]/g, "")
    .replace(/^used other than [^:]*:\s*/i, "")
    .trim();
  return {
    text: truncate((withoutNotes || text).replace(/[.:]$/, ""), GLOSS_MAX_CHARS),
    formOf: isFormOf(markup, text)
  };
}

function readDefinition(html) {
  const markup = leadMarkup(html);
  const text = htmlToText(markup).replace(/\s+([,.;:)])/g, "$1").replace(/\(\s+/g, "(").replace(/:$/, "");
  return { text: truncate(text, DICTIONARY_DEFINITION_MAX_CHARS), formOf: isFormOf(markup, text) };
}

export function parseNativeDefinitions(lang, wikitext, term = "") {
  const edition = EDITIONS[lang];
  if (!edition || typeof wikitext !== "string") {
    return [];
  }

  const raw = [];
  let inSection = false;
  let inBedeutungen = false;
  let afterHeadword = false;
  for (const line of wikitext.split("\n")) {
    if (edition.start.test(line)) {
      inSection = true;
      continue;
    }
    if (edition.next.test(line)) {
      inSection = false;
    }
    if (!inSection) {
      continue;
    }

    if (edition.style === "bedeutungen") {
      // German lists senses as ":[1] …" lines in a {{Bedeutungen}} block.
      if (/^\{\{Bedeutungen\}\}/.test(line)) {
        inBedeutungen = true;
      } else if (inBedeutungen && (!line.trim() || line.startsWith("{{"))) {
        inBedeutungen = false;
      } else if (inBedeutungen) {
        const match = line.match(/^:+\s*\[[^\]]*\]\s*(.*)$/);
        if (match) raw.push(match[1]);
      }
    } else if (edition.style === "numbered") {
      // Spanish: ";1 {{csem|label}}: definition".
      const match = line.match(/^;\s*\d+[^:]*:\s*(.*)$/);
      if (match) raw.push(match[1]);
    } else {
      const sense = line.match(/^#(?![#*:])\s*(.*)$/);
      if (sense) {
        // Italian sometimes starts a sense list with a "# {{Pn|w}} …" headword
        // line and nests the senses below it as "#*" lines.
        afterHeadword = /^\{\{Pn\|/.test(sense[1]);
        if (!afterHeadword) raw.push(sense[1]);
        continue;
      }
      const nested = afterHeadword && line.match(/^#\*(?![*:])\s*(.*)$/);
      if (nested) raw.push(nested[1]);
    }
  }

  const definitions = [];
  for (const line of raw) {
    const definition = truncate(cleanWikitext(line, term), DICTIONARY_DEFINITION_MAX_CHARS);
    if (definition.length > 1 && !definitions.includes(definition)) {
      definitions.push(definition);
    }
    if (definitions.length === DICTIONARY_DEFINITIONS_MAX) break;
  }
  return definitions;
}

// Reduce one line of wikitext to readable plain text.
export function cleanWikitext(text, term = "") {
  let value = String(text ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1")
    .replace(/\[https?:\/\/\S+\]/g, "");

  // Resolve innermost links, then innermost templates, until none are left.
  for (let pass = 0; pass < 10 && /\[\[[^[\]]*\]\]/.test(value); pass += 1) {
    value = value.replace(/\[\[([^[\]]*)\]\]/g, (_, body) => linkText(body));
  }
  for (let pass = 0; pass < 10 && /\{\{[^{}]*\}\}/.test(value); pass += 1) {
    value = value.replace(/\{\{([^{}]*)\}\}/g, (_, body) => templateText(body, term));
  }

  return decodeEntities(value)
    .replace(/[{}[\]]/g, "")
    .replace(/'{2,}/g, "")
    .replace(/\(\s*[,;]?\s*\)/g, "")
    .replace(/\s+([,.])/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:.–-]+/, "")
    .trim();
}

function linkText(body) {
  const [target, ...labels] = body.split("|");
  if (MEDIA_LINK.test(target)) {
    return "";
  }
  return labels.length ? labels[labels.length - 1] : target.replace(/#.*$/, "");
}

function templateText(body, term) {
  const [rawName, ...rawArgs] = body.split("|");
  const name = rawName.trim();
  const args = rawArgs.map((arg) => arg.trim()).filter((arg) => arg && !/^[\w-]+\s*=/.test(arg));
  if (/^pn$/i.test(name)) {
    return rawArgs.length ? "" : term;
  }
  if (name === "plm") {
    const word = args[0] || term;
    return word.charAt(0).toLocaleUpperCase() + word.slice(1);
  }
  if (TEXT_TEMPLATES.has(name.toLowerCase())) {
    return args[0] || "";
  }
  return "";
}

function htmlToText(html) {
  return decodeEntities(String(html ?? "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function decodeEntities(text) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    }
    return named[code.toLowerCase()] ?? match;
  });
}

function truncate(text, max) {
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

// Translate a phrase into English: on-device first, then MyMemory.
export async function translateText(text, lang, { fetchImpl = globalThis.fetch.bind(globalThis), translatorApi = globalThis.Translator } = {}) {
  const translator = await withTimeout(onDeviceTranslator(lang, translatorApi), ON_DEVICE_WAIT_MS);
  if (translator) {
    try {
      const translation = String(await translator.translate(text) ?? "").trim();
      if (translation) {
        return { translation, source: "on-device" };
      }
    } catch {
      // Fall back to MyMemory below.
    }
  }

  if (new TextEncoder().encode(text).length > MYMEMORY_MAX_BYTES) {
    throw new LookupError("too-long");
  }

  let data;
  try {
    const params = new URLSearchParams({ q: text, langpair: `${lang}|en`, mt: "1" });
    data = await getJson(`https://api.mymemory.translated.net/get?${params}`, fetchImpl);
  } catch {
    throw new LookupError(isOffline() ? "offline" : "unavailable");
  }
  const translation = pickMyMemoryTranslation(data);
  if (!translation) {
    throw new LookupError("not-found");
  }
  return { translation, source: "mymemory" };
}

// MyMemory's top result can be an unrelated crowd-sourced memory, so prefer
// its machine-translation match when it offers one.
export function pickMyMemoryTranslation(data) {
  if (data?.quotaFinished || Number(data?.responseStatus) === 429) {
    throw new LookupError("quota");
  }
  const machine = (Array.isArray(data?.matches) ? data.matches : [])
    .filter((match) => match?.["created-by"] === "MT!")
    .map((match) => match.translation);
  return [...machine, data?.responseData?.translatedText]
    .map((candidate) => decodeEntities(String(candidate ?? "")).replace(/\s+/g, " ").trim())
    .find((candidate) => candidate && !/^MYMEMORY WARNING/i.test(candidate)) || "";
}

const onDeviceTranslators = new Map();

// Resolve to an on-device translator only when its model is already installed.
// Otherwise start the download (the lookup follows a user action, which Chrome
// requires) so later lookups can use it, and let this one fall back.
async function onDeviceTranslator(lang, api) {
  if (typeof api?.availability !== "function" || typeof api?.create !== "function") {
    return null;
  }
  const options = { sourceLanguage: lang, targetLanguage: "en" };
  let availability;
  try {
    availability = await withTimeout(api.availability(options), AVAILABILITY_WAIT_MS);
  } catch {
    return null;
  }
  if (!availability || availability === "unavailable") {
    return null;
  }
  if (!onDeviceTranslators.has(lang)) {
    const pending = Promise.resolve().then(() => api.create(options)).catch(() => null);
    onDeviceTranslators.set(lang, pending);
    // Let a later lookup retry if creating or downloading failed.
    pending.then((translator) => {
      if (!translator) onDeviceTranslators.delete(lang);
    });
  }
  return availability === "available" ? onDeviceTranslators.get(lang) : null;
}

function withTimeout(promise, ms) {
  let timer = 0;
  return Promise.race([
    promise,
    new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); })
  ]).finally(() => clearTimeout(timer));
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
