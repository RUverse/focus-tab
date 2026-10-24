import assert from "node:assert/strict";
import test from "node:test";
import {
  DICTIONARY_HISTORY_MAX,
  DICTIONARY_MAX_SIZE,
  DICTIONARY_MIN_WIDTH,
  addDictionaryEntry,
  normalizeSettings,
  removeDictionaryEntry
} from "../shared.js";
import {
  LookupError,
  cleanWikitext,
  lookupTerm,
  parseEnglishDefinitions,
  parseEnglishGlosses,
  parseNativeDefinitions,
  pickMyMemoryTranslation,
  titleVariants
} from "../dictionary-lookup.js";

const entry = (term, extra = {}) => ({ lang: "de", term, translation: "x", definitions: [], source: "wiktionary", at: 1, ...extra });

test("dictionary settings default to German with an empty history", () => {
  const settings = normalizeSettings();
  assert.equal(settings.dictionaryLanguage, "de");
  assert.deepEqual(settings.dictionaryHistory, []);
  assert.equal(settings.dictionaryPos, null);
  assert.equal(settings.dictionarySize, null);
  assert.equal(normalizeSettings({ dictionaryLanguage: "en" }).dictionaryLanguage, "en");
});

test("a resized dictionary box keeps a whole-pixel size within bounds", () => {
  assert.deepEqual(normalizeSettings({ dictionarySize: { width: 400.6, height: 520.2 } }).dictionarySize, { width: 401, height: 520 });
  assert.deepEqual(
    normalizeSettings({ dictionarySize: { width: 10, height: 99999 } }).dictionarySize,
    { width: DICTIONARY_MIN_WIDTH, height: DICTIONARY_MAX_SIZE }
  );
  assert.equal(normalizeSettings({ dictionarySize: { width: "400", height: 300 } }).dictionarySize, null);
  assert.equal(normalizeSettings({ dictionarySize: { width: 400 } }).dictionarySize, null);
});

test("dictionary settings tolerate malformed storage", () => {
  const settings = normalizeSettings({
    dictionaryLanguage: "xx",
    dictionaryPos: { x: "a", y: 3 },
    dictionaryHistory: [
      null,
      "Haus",
      { lang: "xx", term: "Haus", translation: "house" },
      { lang: "de", term: "  ", translation: "house" },
      { lang: "de", term: "Haus", translation: "" },
      { lang: "de", term: " Haus ", translation: " house ", definitions: ["a", 5, "", "b", "c", "d"], source: "?", at: "7" },
      { lang: "de", term: "haus", translation: "duplicate" }
    ]
  });
  assert.equal(settings.dictionaryLanguage, "de");
  assert.equal(settings.dictionaryPos, null);
  assert.deepEqual(settings.dictionaryHistory, [
    { lang: "de", term: "Haus", translation: "house", definitions: ["a", "5", "b"], source: "wiktionary", at: 7 }
  ]);
});

test("new lookups go to the top, replace repeats, and respect the cap", () => {
  let history = [entry("Haus"), entry("Baum")];
  history = addDictionaryEntry(history, entry("baum", { translation: "tree" }));
  assert.deepEqual(history.map((item) => item.term), ["baum", "Haus"]);
  assert.equal(history[0].translation, "tree");

  // The same word in another language is a separate row.
  history = addDictionaryEntry(history, entry("Haus", { lang: "nl" }));
  assert.deepEqual(history.map((item) => `${item.lang}:${item.term}`), ["nl:Haus", "de:baum", "de:Haus"]);

  const full = Array.from({ length: DICTIONARY_HISTORY_MAX }, (_, index) => entry(`w${index}`));
  const capped = addDictionaryEntry(full, entry("neu"));
  assert.equal(capped.length, DICTIONARY_HISTORY_MAX);
  assert.equal(capped[0].term, "neu");
  assert.equal(capped.at(-1).term, `w${DICTIONARY_HISTORY_MAX - 2}`);
});

test("single history entries can be removed", () => {
  const history = [entry("Haus"), entry("Baum"), entry("Baum", { lang: "nl" })];
  assert.deepEqual(removeDictionaryEntry(history, "de", "baum").map((item) => `${item.lang}:${item.term}`), ["de:Haus", "nl:Baum"]);
});

test("wikitext cleanup keeps readable text", () => {
  assert.equal(cleanWikitext("{{K|ugs.}} [[Gesamtheit]] der [[Bewohner|Bewohnerin]]<ref>x</ref>"), "Gesamtheit der Bewohnerin");
  assert.equal(cleanWikitext("{{plm|edificación}} destinada a [[vivienda]].", "casa"), "Edificación destinada a vivienda.");
  assert.equal(cleanWikitext("''f'' [[File:A.jpg|thumb|una [[casa]]]] [[ménage#fr|Ménage]], {{lien|foyer|fr}}"), "f Ménage, foyer");
  assert.equal(cleanWikitext("{{bouwkunde|nld}}, {{wonen|nld}} het '''{{pn}}''' &amp; meer", "huis"), "het huis & meer");
});

test("German definitions come from the {{Bedeutungen}} block", () => {
  const wikitext = [
    "== Haus ({{Sprache|Deutsch}}) ==",
    "=== {{Wortart|Substantiv|Deutsch}}, {{n}} ===",
    "{{Bedeutungen}}",
    ":[1] zu einem bestimmten Zweck erbautes [[Gebäude]]",
    ":[2] {{K|ugs.}} zum Wohnen dienendes [[Gebäude]]",
    "",
    "{{Herkunft}}",
    ":[1] nicht diese Zeile",
    "== Haus ({{Sprache|Englisch}}) ==",
    "{{Bedeutungen}}",
    ":[1] English section"
  ].join("\n");
  assert.deepEqual(parseNativeDefinitions("de", wikitext, "Haus"), [
    "zu einem bestimmten Zweck erbautes Gebäude",
    "zum Wohnen dienendes Gebäude"
  ]);
});

test("French, Portuguese, and Dutch definitions are top-level # lines", () => {
  const fr = [
    "== {{langue|en}} ==", "# English sense",
    "== {{langue|fr}} ==", "=== {{S|nom|fr}} ===",
    "# {{édifices|fr}} [[bâtiment|Bâtiment]] servant de [[logis]].", "#* {{exemple|lang=fr|Une maison.}}",
    "# [[ménage#fr|Ménage]], foyer.", "== {{langue|it}} ==", "# senso italiano"
  ].join("\n");
  assert.deepEqual(parseNativeDefinitions("fr", fr, "maison"), ["Bâtiment servant de logis.", "Ménage, foyer."]);

  const pt = ["={{-pt-}}=", "==Substantivo==", "# [[construção]] que [[servir|serve]] de [[moradia]]", "#* ''Exemplo''", "={{-es-}}=", "# casa española"].join("\n");
  assert.deepEqual(parseNativeDefinitions("pt", pt, "casa"), ["construção que serve de moradia"]);

  const nl = ["{{=nld=}}", "{{-noun-|nld}}", "#{{bouwkunde|nld}}, {{wonen|nld}} gebouw bestemd om in te wonen", "{{bijv-1|Zij wonen in een '''{{pn}}'''.}}", "{{=afr=}}", "#Afrikaans"].join("\n");
  assert.deepEqual(parseNativeDefinitions("nl", nl, "huis"), ["gebouw bestemd om in te wonen"]);
});

test("Spanish definitions use numbered ; lines", () => {
  const es = [
    "== {{lengua|es}} ==", "==== {{sustantivo femenino|es}} ====",
    ";1 {{csem|vivienda}}: {{plm|edificación}} destinada a [[vivienda]].", "{{sinónimo|domicilio}}",
    ";2: {{plm|domicilio}}.", "== {{lengua|pt}} ==", ";1: casa portuguesa"
  ].join("\n");
  assert.deepEqual(parseNativeDefinitions("es", es, "casa"), ["Edificación destinada a vivienda.", "Domicilio."]);
});

test("Italian definitions handle # lines and senses nested under a headword line", () => {
  const plain = ["== {{-it-}} ==", "{{-verb-|it}}", "# [[nutrirsi]] di [[alimenti]]", "#* ''{{Pn}} lentamente''"].join("\n");
  assert.deepEqual(parseNativeDefinitions("it", plain, "mangiare"), ["nutrirsi di alimenti"]);

  const nested = [
    "== {{-it-}} ==", "{{-sost-|it}}", "# {{Pn|w}} ''f sing'' {{Linkp|case}}",
    "#* {{Term|architettura|it}} [[edificio]] per [[abitazione]]", "#** ''un esempio''", "#* [[dimora]] di una [[persona]]"
  ].join("\n");
  assert.deepEqual(parseNativeDefinitions("it", nested, "casa"), ["edificio per abitazione", "dimora di una persona"]);
});

test("definitions are capped at three and long ones are shortened", () => {
  const long = "parola ".repeat(100);
  const wikitext = ["== {{-it-}} ==", `# ${long}`, "# due", "# tre", "# quattro"].join("\n");
  const definitions = parseNativeDefinitions("it", wikitext, "x");
  assert.equal(definitions.length, 3);
  assert.ok(definitions[0].endsWith("…") && definitions[0].length <= 400);
  assert.deepEqual(parseNativeDefinitions("it", "no language section", "x"), []);
});

test("English glosses prefer real senses over form-of and proper-noun entries", () => {
  const link = (word) => `<a rel="mw:WikiLink" href="/wiki/${word}">${word}</a>`;
  const json = {
    de: [
      { partOfSpeech: "Noun", definitions: [
        { definition: `${link("house")}, ${link("building")}` },
        { definition: '<span class="usage-label-sense">(figuratively)</span> home; house' }
      ] },
      { partOfSpeech: "Verb", definitions: [
        { definition: '<span class="form-of-definition">inflection of <i>hausen</i>:</span><ol><li>first-person singular</li></ol>' }
      ] },
      { partOfSpeech: "Proper noun", definitions: [{ definition: "a municipality of Styria, Austria" }] }
    ],
    en: [{ partOfSpeech: "Noun", definitions: [{ definition: "English sense" }] }]
  };
  assert.deepEqual(parseEnglishGlosses(json, "de"), ["house, building", "home", "house"]);

  const formOnly = { de: [{ partOfSpeech: "Verb", definitions: [{ definition: "first/third-person singular preterite of gehen" }] }] };
  assert.deepEqual(parseEnglishGlosses(formOnly, "de"), ["first/third-person singular preterite of gehen"]);
  assert.deepEqual(parseEnglishGlosses({ fr: [] }, "de"), []);
  assert.deepEqual(parseEnglishGlosses(null, "de"), []);
});

test("title variants try the typed text, then capitalized and lowercase forms", () => {
  assert.deepEqual(titleVariants("haus"), ["haus", "Haus"]);
  assert.deepEqual(titleVariants("Laufen"), ["Laufen", "laufen"]);
});

test("MyMemory results prefer machine translation over crowd-sourced memories", () => {
  const data = {
    responseData: { translatedText: "La lechuza de Minerva" },
    matches: [
      { translation: "La lechuza de Minerva", "created-by": "MateCat" },
      { translation: "Good morning my friend", "created-by": "MT!" }
    ]
  };
  assert.equal(pickMyMemoryTranslation(data), "Good morning my friend");
  assert.equal(pickMyMemoryTranslation({ responseData: { translatedText: "I don&#39;t know" }, matches: [] }), "I don't know");
  assert.equal(pickMyMemoryTranslation({ responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL" } }), "");
  assert.throws(() => pickMyMemoryTranslation({ quotaFinished: true }), (error) => error.code === "quota");
});

function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    for (const [pattern, reply] of routes) {
      if (pattern.test(url)) {
        if (reply instanceof Error) throw reply;
        return { ok: true, status: 200, json: async () => reply };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchImpl, calls };
}

const germanHaus = {
  parse: {
    title: "Haus",
    wikitext: "== Haus ({{Sprache|Deutsch}}) ==\n{{Bedeutungen}}\n:[1] erbautes [[Gebäude]]\n"
  }
};

test("word lookups combine English glosses with the native definition", async () => {
  const { fetchImpl, calls } = fakeFetch([
    // Lowercase "haus" is a German verb form on English Wiktionary; the
    // German edition settles the lemma "Haus".
    [/en\.wiktionary\.org.*definition\/haus$/, { de: [{ partOfSpeech: "Verb", definitions: [{ definition: "singular imperative of hausen" }] }] }],
    [/en\.wiktionary\.org.*definition\/Haus$/, { de: [{ partOfSpeech: "Noun", definitions: [{ definition: "house" }] }] }],
    [/de\.wiktionary\.org.*page=haus&/, { error: { code: "missingtitle" } }],
    [/de\.wiktionary\.org.*page=Haus&/, germanHaus]
  ]);
  const result = await lookupTerm("  haus ", "de", { fetchImpl, translatorApi: null, now: 5 });
  assert.deepEqual(result, {
    lang: "de", term: "Haus", definitions: ["erbautes Gebäude"], at: 5, translation: "house", source: "wiktionary"
  });
  assert.ok(calls.every(({ url }) => !url.includes("mymemory")));
  const wikimedia = calls.find(({ url }) => url.includes("wiktionary.org"));
  assert.equal(wikimedia.options.credentials, "omit");
  assert.match(wikimedia.options.headers["Api-User-Agent"], /FocusTab/);
});

test("words without English glosses are translated, keeping their definition", async () => {
  const { fetchImpl } = fakeFetch([
    [/de\.wiktionary\.org.*page=Haus&/, germanHaus],
    [/mymemory/, { responseData: { translatedText: "House" }, matches: [] }]
  ]);
  const result = await lookupTerm("Haus", "de", { fetchImpl, translatorApi: null });
  assert.equal(result.translation, "House");
  assert.equal(result.source, "mymemory");
  assert.deepEqual(result.definitions, ["erbautes Gebäude"]);
});

test("sentences skip Wiktionary and use the on-device translator when available", async () => {
  const { fetchImpl, calls } = fakeFetch([]);
  const created = [];
  const translatorApi = {
    availability: async () => "available",
    create: async (options) => {
      created.push(options);
      return { translate: async (text) => `[en] ${text}` };
    }
  };
  const result = await lookupTerm("Je ne sais pas du tout", "fr", { fetchImpl, translatorApi });
  assert.equal(result.translation, "[en] Je ne sais pas du tout");
  assert.equal(result.source, "on-device");
  assert.deepEqual(result.definitions, []);
  assert.deepEqual(created, [{ sourceLanguage: "fr", targetLanguage: "en" }]);
  assert.equal(calls.length, 0);
});

test("a downloadable on-device model starts downloading while MyMemory answers", async () => {
  const { fetchImpl } = fakeFetch([[/mymemory/, { responseData: { translatedText: "Good evening, everyone" }, matches: [] }]]);
  let created = 0;
  const translatorApi = {
    availability: async () => "downloadable",
    create: () => { created += 1; return new Promise(() => {}); }
  };
  const result = await lookupTerm("Bonsoir à tous et à toutes", "it", { fetchImpl, translatorApi });
  assert.equal(result.source, "mymemory");
  assert.equal(created, 1);
});

test("a stuck model check does not hold up the fallback for long", async () => {
  const { fetchImpl } = fakeFetch([[/mymemory/, { responseData: { translatedText: "See you tomorrow" }, matches: [] }]]);
  const translatorApi = { availability: () => new Promise(() => {}), create: async () => assert.fail("should not create") };
  const started = Date.now();
  const result = await lookupTerm("Wir sehen uns morgen früh", "nl", { fetchImpl, translatorApi });
  assert.equal(result.source, "mymemory");
  assert.ok(Date.now() - started < 2000);
});

test("phrases fall back to MyMemory when no on-device model is available", async () => {
  const { fetchImpl, calls } = fakeFetch([
    [/mymemory/, { responseData: { translatedText: "I have no time today" }, matches: [] }]
  ]);
  const translatorApi = { availability: async () => "unavailable", create: async () => assert.fail("should not create") };
  const result = await lookupTerm("Ich habe heute keine Zeit", "es", { fetchImpl, translatorApi });
  assert.equal(result.translation, "I have no time today");
  assert.equal(result.source, "mymemory");
  const url = new URL(calls.at(-1).url);
  assert.equal(url.searchParams.get("q"), "Ich habe heute keine Zeit");
  assert.equal(url.searchParams.get("langpair"), "es|en");
});

test("unknown text that only echoes back is reported as not found", async () => {
  const { fetchImpl } = fakeFetch([[/mymemory/, { responseData: { translatedText: "xqzvbn" }, matches: [] }]]);
  await assert.rejects(lookupTerm("xqzvbn", "pt", { fetchImpl, translatorApi: null }), (error) => error instanceof LookupError && error.code === "not-found");
});

test("network failures and empty input give readable errors", async () => {
  const { fetchImpl } = fakeFetch([[/./, new TypeError("Failed to fetch")]]);
  await assert.rejects(lookupTerm("Haus", "nl", { fetchImpl, translatorApi: null }), (error) => error.code === "unavailable");
  await assert.rejects(lookupTerm("   ", "de", { fetchImpl, translatorApi: null }), (error) => error.code === "empty");
  await assert.rejects(
    lookupTerm("ä".repeat(300), "de", { fetchImpl, translatorApi: null }),
    (error) => error.code === "too-long"
  );
});

test("English definitions take each part of speech in turn and skip codes", () => {
  const json = {
    en: [
      { partOfSpeech: "Symbol", definitions: [{ definition: "<i>ISO 639-2</i> code for Rundi" }] },
      {
        partOfSpeech: "Verb",
        definitions: [
          { definition: 'To move <a href="/wiki/swiftly">swiftly</a>.<ol><li>To move forward quickly</li></ol>' },
          { definition: "(intransitive) To flee ; to escape." }
        ]
      },
      { partOfSpeech: "Noun", definitions: [{ definition: "Act or instance of running." }, { definition: "A trip." }] }
    ],
    fr: [{ partOfSpeech: "Noun", definitions: [{ definition: "French sense" }] }]
  };
  assert.deepEqual(parseEnglishDefinitions(json), {
    definitions: ["To move swiftly.", "Act or instance of running.", "(intransitive) To flee; to escape."],
    partsOfSpeech: ["verb", "noun"]
  });
  const codeOnly = { en: [{ partOfSpeech: "Symbol", definitions: [{ definition: "code for Rundi" }] }] };
  assert.deepEqual(parseEnglishDefinitions(codeOnly), { definitions: ["code for Rundi"], partsOfSpeech: ["symbol"] });
  assert.deepEqual(parseEnglishDefinitions({ de: [] }), { definitions: [], partsOfSpeech: [] });
});

test("English lookups use only English Wiktionary", async () => {
  const { fetchImpl, calls } = fakeFetch([
    [/en\.wiktionary\.org.*definition\/Serendipity$/, {}],
    [/en\.wiktionary\.org.*definition\/serendipity$/, { en: [{ partOfSpeech: "Noun", definitions: [{ definition: "A fortunate discovery by chance." }] }] }]
  ]);
  const translatorApi = { availability: async () => assert.fail("should not translate") };
  const result = await lookupTerm("Serendipity", "en", { fetchImpl, translatorApi, now: 3 });
  assert.deepEqual(result, {
    lang: "en", term: "serendipity", translation: "noun", definitions: ["A fortunate discovery by chance."], source: "wiktionary", at: 3
  });
  assert.ok(calls.every(({ url }) => url.startsWith("https://en.wiktionary.org/")));
});

test("English sentences and unknown words are not sent to a translator", async () => {
  const { fetchImpl, calls } = fakeFetch([]);
  await assert.rejects(lookupTerm("this is a whole sentence", "en", { fetchImpl, translatorApi: null }), (error) => error.code === "no-definition");
  assert.equal(calls.length, 0);
  await assert.rejects(lookupTerm("xqzvbn", "en", { fetchImpl, translatorApi: null }), (error) => error.code === "no-definition");
  assert.ok(calls.every(({ url }) => !url.includes("mymemory")));
  const offline = fakeFetch([[/./, new TypeError("Failed to fetch")]]);
  await assert.rejects(lookupTerm("house", "en", { fetchImpl: offline.fetchImpl, translatorApi: null }), (error) => error.code === "unavailable");
});
