/**
 * Output languages. Dates, times, weekdays and list joining come from `Intl`
 * — only the prose the app writes around them lives in this table.
 * Each id doubles as the BCP-47 tag handed to `Intl`.
 */
export type LangId = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'ko' | 'zh'

export type Strings = {
  /** `zone` arrives already parenthesized, or empty when the zone is hidden. */
  emailIntro: (zone: string) => string
  emailOnlyBusy: (zone: string, list: string) => string
  emailBusy: (list: string) => string
  emailClose: string
  /** The whole zone note, brackets and spacing included — CJK wants （）, not (). */
  zoneNote: (abbr: string) => string
  /** Heading and column header; renderers add the colon. */
  cantDo: string
  cantDoInline: (list: string) => string
  day: string
  available: string
  unavailable: string
  myAvailability: string
}

export const STRINGS: Record<LangId, Strings> = {
  en: {
    emailIntro: (z) => `Here are a few times that work on my end${z}:`,
    emailOnlyBusy: (z, l) =>
      `My schedule is fairly open${z} — the only times that won't work are ${l}. Happy to fit in around whatever suits you.`,
    emailBusy: (l) => `I'm tied up ${l}.`,
    emailClose: 'Happy to work around your schedule if none of these fit.',
    zoneNote: (a) => ` (all times ${a})`,
    cantDo: "Can't do",
    cantDoInline: (l) => `can't do ${l}`,
    day: 'Day',
    available: 'Available',
    unavailable: 'Not available',
    myAvailability: 'My availability',
  },

  es: {
    emailIntro: (z) => `Estos horarios me vienen bien${z}:`,
    emailOnlyBusy: (z, l) =>
      `Tengo la agenda bastante despejada${z}. Lo único que no me encaja es ${l}, así que dime qué prefieres.`,
    emailBusy: (l) => `Eso sí, ${l} ya lo tengo ocupado.`,
    emailClose: 'Si no te encaja ninguno, dime y lo vemos.',
    zoneNote: (a) => ` (en horario de ${a})`,
    cantDo: 'Ocupado',
    cantDoInline: (l) => `ocupado ${l}`,
    day: 'Día',
    available: 'Libre',
    unavailable: 'Ocupado',
    myAvailability: 'Mi disponibilidad',
  },

  fr: {
    emailIntro: (z) => `Voici mes disponibilités${z} :`,
    emailOnlyBusy: (z, l) =>
      `Je suis assez disponible${z} ; il n'y a que ${l} qui ne soit pas possible. Dites-moi ce qui vous arrange.`,
    emailBusy: (l) => `En revanche, je ne suis pas libre ${l}.`,
    emailClose: "Si aucun de ces créneaux ne convient, n'hésitez pas à m'en proposer un autre.",
    zoneNote: (a) => ` (heure de ${a})`,
    cantDo: 'Occupé',
    cantDoInline: (l) => `occupé ${l}`,
    day: 'Jour',
    available: 'Libre',
    unavailable: 'Occupé',
    myAvailability: 'Mes disponibilités',
  },

  de: {
    emailIntro: (z) => `Folgende Zeiten würden mir passen${z}:`,
    emailOnlyBusy: (z, l) =>
      `Mein Kalender ist recht frei${z}. Nur ${l} geht leider nicht – sagen Sie einfach, was Ihnen am besten passt.`,
    emailBusy: (l) => `Verplant bin ich ${l}.`,
    emailClose: 'Falls nichts davon passt, finden wir sicher einen anderen Termin.',
    zoneNote: (a) => ` (alle Zeiten ${a})`,
    cantDo: 'Belegt',
    cantDoInline: (l) => `belegt ${l}`,
    day: 'Tag',
    available: 'Frei',
    unavailable: 'Belegt',
    myAvailability: 'Meine Verfügbarkeit',
  },

  it: {
    emailIntro: (z) => `Queste sono le mie disponibilità${z}:`,
    emailOnlyBusy: (z, l) =>
      `Ho l'agenda abbastanza libera${z}: l'unico momento che non va è ${l}. Dimmi pure cosa preferisci.`,
    emailBusy: (l) => `Non ho invece disponibilità ${l}.`,
    emailClose: "Se nessuna di queste fasce va bene, sentiamoci e troviamo un'alternativa.",
    zoneNote: (a) => ` (orari in ${a})`,
    cantDo: 'Occupato',
    cantDoInline: (l) => `occupato ${l}`,
    day: 'Giorno',
    available: 'Libero',
    unavailable: 'Occupato',
    myAvailability: 'Le mie disponibilità',
  },

  pt: {
    emailIntro: (z) => `Seguem os horários em que estou livre${z}:`,
    emailOnlyBusy: (z, l) =>
      `Minha agenda está bem tranquila${z}. Só não consigo ${l} — me diga o que fica melhor para você.`,
    emailBusy: (l) => `Já tenho compromisso ${l}.`,
    emailClose: 'Se nenhum desses horários servir, é só falar que a gente ajusta.',
    zoneNote: (a) => ` (horários em ${a})`,
    cantDo: 'Ocupado',
    cantDoInline: (l) => `ocupado ${l}`,
    day: 'Dia',
    available: 'Livre',
    unavailable: 'Ocupado',
    myAvailability: 'Minha disponibilidade',
  },

  ja: {
    emailIntro: (z) => `下記の日時でご都合はいかがでしょうか${z}。`,
    emailOnlyBusy: (z, l) =>
      `日程はおおむね空いております${z}。${l}のみ都合がつきませんので、ご都合のよい日時をお知らせください。`,
    emailBusy: (l) => `なお、${l}は先約がございます。`,
    emailClose: 'ご都合が合わない場合は、別途調整いたしますのでお気軽にお知らせください。',
    zoneNote: (a) => `（すべて${a}）`,
    cantDo: '不可',
    cantDoInline: (l) => `${l}は不可`,
    day: '日付',
    available: '空き',
    unavailable: '予定あり',
    myAvailability: '空き時間',
  },

  ko: {
    emailIntro: (z) => `가능한 시간은 아래와 같습니다${z}.`,
    emailOnlyBusy: (z, l) =>
      `일정은 대체로 여유가 있습니다${z}. ${l}만 어려우니 편하신 시간을 알려주시면 맞추겠습니다.`,
    emailBusy: (l) => `다만 ${l}에는 선약이 있습니다.`,
    emailClose: '맞는 시간이 없으시면 편하신 일정으로 다시 조율하겠습니다.',
    zoneNote: (a) => ` (모두 ${a} 기준)`,
    cantDo: '불가',
    cantDoInline: (l) => `${l} 불가`,
    day: '날짜',
    available: '가능',
    unavailable: '일정 있음',
    myAvailability: '가능한 시간',
  },

  zh: {
    emailIntro: (z) => `我这边方便的时间如下${z}：`,
    emailOnlyBusy: (z, l) => `我最近的日程比较空${z}，只有 ${l} 不方便，您看什么时候合适？`,
    emailBusy: (l) => `另外，${l} 我这边已经有安排了。`,
    emailClose: '如果这些时间都不方便，我们可以再商量。',
    zoneNote: (a) => `（均为 ${a}）`,
    cantDo: '没空',
    cantDoInline: (l) => `${l} 没空`,
    day: '日期',
    available: '有空',
    unavailable: '已有安排',
    myAvailability: '我的空闲时间',
  },
}

/** Each language named in itself, so the picker reads to the person choosing. */
export const LANGUAGE_NAMES: Record<LangId, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
}

export const LANG_IDS = Object.keys(STRINGS) as LangId[]

export const isLang = (value: string): value is LangId => value in STRINGS

/** First browser preference we actually speak, else English. */
export function detectLang(): LangId {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.split('-')[0].toLowerCase()
    if (isLang(base)) return base
  }
  return 'en'
}
