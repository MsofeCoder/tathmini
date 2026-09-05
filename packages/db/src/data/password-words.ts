/**
 * Word list for the memorable-password fallback in
 * `scripts/assign-passwords.ts` — used only for accounts the admin left
 * blank in the spreadsheet.
 *
 * Everyday Swahili nouns, because the people typing these are Tanzanian
 * college tutors: a word you already know is one you can be told over a
 * phone line and type into a handset without a spelling argument. That
 * is the entire point — `xK9_mQ2vBn4pLs7T` is unusable in the field, and
 * unusable credentials get written on paper and shared, which is worse
 * than a slightly shorter keyspace.
 *
 * Selection rules, so a future edit keeps the properties that matter:
 *
 * - 4–9 letters, ASCII only, no diacritics, no apostrophes. Long enough
 *   to be distinct when spoken, short enough to type twice.
 * - No two words differing by one letter (no kaka/baba pairs), so a
 *   mis-heard word is a wrong word, not a plausible one.
 * - Nouns only, and neutral ones — nothing about people, bodies,
 *   religion, money, illness or death. These get read aloud by a
 *   coordinator to a colleague.
 * - No word that is also a common English word, so an English keyboard's
 *   autocorrect has nothing to "fix".
 *
 * Keyspace: 160 words. See PASSWORD_WORDS.length assertions in the tests
 * — the generator's entropy is documented against this count, so adding
 * words is fine and removing them is not, without updating both.
 */

export const PASSWORD_WORDS: string[] = [
  // Wanyama — animals
  'simba',
  'tembo',
  'twiga',
  'chui',
  'nyati',
  'punda',
  'farasi',
  'ngamia',
  'kondoo',
  'mbuzi',
  'kuku',
  'bata',
  'samaki',
  'papa',
  'pweza',
  'kasa',
  'mamba',
  'nyoka',
  'kipepeo',
  'nyuki',
  'sisimizi',
  'panya',
  'paka',
  'sungura',
  'kobe',
  'nguruwe',
  'swala',
  'fisi',
  'kifaru',
  'kiboko',

  // Asili — nature and weather
  'moto',
  'maji',
  'upepo',
  'mvua',
  'jua',
  'mwezi',
  'nyota',
  'wingu',
  'radi',
  'umande',
  'bahari',
  'ziwa',
  'mlima',
  'bonde',
  'msitu',
  'jangwa',
  'pwani',
  'kisiwa',
  'mchanga',
  'jiwe',
  'udongo',
  'kivuli',
  'mawimbi',
  'chemchemi',

  // Mimea na matunda — plants and fruit
  'mti',
  'jani',
  'mzizi',
  'tunda',
  'embe',
  'nazi',
  'ndizi',
  'chungwa',
  'papai',
  'nanasi',
  'pera',
  'zabibu',
  'muhogo',
  'mahindi',
  'mpunga',
  'maharage',
  'karanga',
  'viazi',
  'nyanya',
  'kitunguu',
  'pilipili',
  'tangawizi',
  'mdalasini',
  'mchicha',

  // Vitu vya nyumbani — household things
  'nyumba',
  'mlango',
  'dirisha',
  'paa',
  'meza',
  'kiti',
  'kitanda',
  'godoro',
  'taa',
  'kitabu',
  'kalamu',
  'karatasi',
  'begi',
  'kikombe',
  'sahani',
  'kijiko',
  'uma',
  'sufuria',
  'birika',
  'ndoo',
  'ufunguo',
  'kioo',
  'kamba',
  'kitambaa',

  // Mahali na safari — places and travel
  'shule',
  'darasa',
  'soko',
  'duka',
  'hospitali',
  'kanisa',
  'kijiji',
  'mji',
  'daraja',
  'barabara',
  'njia',
  'lango',
  'gari',
  'baiskeli',
  'pikipiki',
  'basi',
  'treni',
  'meli',
  'mashua',
  'chombo',

  // Chakula na vinywaji — food and drink
  'mkate',
  'asali',
  'sukari',
  'chumvi',
  'maziwa',
  'siagi',
  'chai',
  'kahawa',
  'supu',
  'ugali',
  'wali',
  'mchuzi',

  // Kazi na sanaa — work and craft
  'kazi',
  'somo',
  'ngoma',
  'wimbo',
  'hadithi',
  'picha',
  'rangi',
  'sauti',
  'chuma',
  'shaba',
  'randa',
  'ufundi',
  'kiwanda',
  'zana',
  'nyundo',
  'msumeno',

  // Sifa — qualities
  'amani',
  'furaha',
  'tumaini',
  'nguvu',
  'heshima',
  'ukweli',
  'umoja',
  'bidii',
  'subira',
  'busara',
  'shukrani',
  'ustadi',
];
