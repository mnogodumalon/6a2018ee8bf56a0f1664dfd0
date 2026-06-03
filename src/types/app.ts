// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Repositories {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    name?: string;
    beschreibung?: string;
    url?: string;
    inhaber?: string;
    sichtbarkeit?: LookupValue;
    erstellungsdatum?: string; // Format: YYYY-MM-DD oder ISO String
  };
}

export interface Issues {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    titel?: string;
    beschreibung?: string;
    repository?: string; // applookup -> URL zu 'Repositories' Record
    status?: LookupValue;
    prioritaet?: LookupValue;
    typ?: LookupValue;
    labels?: LookupValue[];
    meilenstein?: string;
    faelligkeitsdatum?: string; // Format: YYYY-MM-DD oder ISO String
    bearbeiter_vorname?: string;
    bearbeiter_nachname?: string;
    melder_vorname?: string;
    melder_nachname?: string;
    erstellt_am?: string; // Format: YYYY-MM-DD oder ISO String
  };
}

export interface Kommentare {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    issue?: string; // applookup -> URL zu 'Issues' Record
    kommentar_text?: string;
    autor_vorname?: string;
    autor_nachname?: string;
    erstellt_am?: string; // Format: YYYY-MM-DD oder ISO String
  };
}

export const APP_IDS = {
  REPOSITORIES: '6a2018d55773ce092125236a',
  ISSUES: '6a2018da19545f2ab61978ca',
  KOMMENTARE: '6a2018db7f79b8b00580989b',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'repositories': {
    sichtbarkeit: [{ key: "oeffentlich", label: "Öffentlich" }, { key: "privat", label: "Privat" }],
  },
  'issues': {
    status: [{ key: "offen", label: "Offen" }, { key: "in_bearbeitung", label: "In Bearbeitung" }, { key: "geschlossen", label: "Geschlossen" }],
    prioritaet: [{ key: "niedrig", label: "Niedrig" }, { key: "mittel", label: "Mittel" }, { key: "hoch", label: "Hoch" }, { key: "kritisch", label: "Kritisch" }],
    typ: [{ key: "fehler", label: "Fehler" }, { key: "feature", label: "Feature" }, { key: "aufgabe", label: "Aufgabe" }, { key: "verbesserung", label: "Verbesserung" }],
    labels: [{ key: "bug", label: "Bug" }, { key: "enhancement", label: "Enhancement" }, { key: "documentation", label: "Documentation" }, { key: "question", label: "Question" }, { key: "help_wanted", label: "Help Wanted" }, { key: "good_first_issue", label: "Good First Issue" }, { key: "duplicate", label: "Duplicate" }, { key: "wontfix", label: "Wontfix" }],
  },
};

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'repositories': {
    'name': 'string/text',
    'beschreibung': 'string/textarea',
    'url': 'string/url',
    'inhaber': 'string/text',
    'sichtbarkeit': 'lookup/radio',
    'erstellungsdatum': 'date/date',
  },
  'issues': {
    'titel': 'string/text',
    'beschreibung': 'string/textarea',
    'repository': 'applookup/select',
    'status': 'lookup/select',
    'prioritaet': 'lookup/select',
    'typ': 'lookup/select',
    'labels': 'multiplelookup/checkbox',
    'meilenstein': 'string/text',
    'faelligkeitsdatum': 'date/date',
    'bearbeiter_vorname': 'string/text',
    'bearbeiter_nachname': 'string/text',
    'melder_vorname': 'string/text',
    'melder_nachname': 'string/text',
    'erstellt_am': 'date/datetimeminute',
  },
  'kommentare': {
    'issue': 'applookup/select',
    'kommentar_text': 'string/textarea',
    'autor_vorname': 'string/text',
    'autor_nachname': 'string/text',
    'erstellt_am': 'date/datetimeminute',
  },
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateRepositories = StripLookup<Repositories['fields']>;
export type CreateIssues = StripLookup<Issues['fields']>;
export type CreateKommentare = StripLookup<Kommentare['fields']>;