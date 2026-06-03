import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Issues, Repositories } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId, createRecordUrl, cleanFieldsForApi, getUserProfile, LivingAppsService } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ComputedContext } from '@/config/form-enhancements/types';
import { applyFieldOrder, flattenFieldOrder, applyDefaults, evalComputed, numberInputProps, clampNumberValue, classifyComputed, extractApplookupRefs, mergeApplookupRefs, resolveApplookupRef } from '@/config/form-enhancements/types';
import { formEnhancements, computedDeps, computedApplookupRefs } from '@/config/form-enhancements/Issues';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/Combobox';
import { RepositoriesDialog } from '@/components/dialogs/RepositoriesDialog';
import { DatePicker } from '@/components/DatePicker';
import { Checkbox } from '@/components/ui/checkbox';
import { IconCamera, IconChevronDown, IconCircleCheck, IconClipboard, IconFileText, IconLoader2, IconPhotoPlus, IconSparkles, IconUpload, IconX } from '@tabler/icons-react';
import { fileToDataUri, extractFromInput, extractPhotoMeta, reverseGeocode } from '@/lib/ai';
import { lookupKey, lookupKeys } from '@/lib/formatters';

interface IssuesDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (fields: Issues['fields']) => Promise<void>;
  defaultValues?: Issues['fields'];
  /** Record id when editing — enables the attachments section. Omit on create. */
  recordId?: string;
  repositoriesList: Repositories[];
  enablePhotoScan?: boolean;
  enablePhotoLocation?: boolean;
}

export function IssuesDialog({ open, onClose, onSubmit, defaultValues, recordId, repositoriesList, enablePhotoScan = true, enablePhotoLocation = true }: IssuesDialogProps) {
  const [fields, setFields] = useState<Partial<Issues['fields']>>({});
  const [saving, setSaving] = useState(false);
  // Dirty-tracking: in edit-mode the Speichern button is disabled until the
  // user actually changes something. JSON.stringify is good enough for our
  // fields (plain values + LookupValue objects + string arrays).
  const isDirty = useMemo(() => {
    if (!defaultValues) return true;  // create-mode: always allow submit
    try {
      return JSON.stringify(fields) !== JSON.stringify(defaultValues);
    } catch {
      return true;
    }
  }, [fields, defaultValues]);
  // Inline-Create state for "Repositories" target. The dropdown's
  // "+ Neuer …" option opens a sub-dialog; on submit we POST, add the new
  // record to the local `extraRepositories` list, and select it in
  // the originating Combobox via the captured `createRepositoriesField`.
  const [createRepositoriesOpen, setCreateRepositoriesOpen] = useState(false);
  const [createRepositoriesInitial, setCreateRepositoriesInitial] = useState('');
  const [createRepositoriesField, setCreateRepositoriesField] = useState<string>('');
  const [extraRepositories, setExtraRepositories] = useState< Repositories[]>([]);
  const repositoriesListAll = useMemo(
    () => [...repositoriesList, ...extraRepositories],
    [repositoriesList, extraRepositories],
  );
  function openCreateRepositories(fieldKey: string, q: string) {
    setCreateRepositoriesField(fieldKey);
    setCreateRepositoriesInitial(q);
    setCreateRepositoriesOpen(true);
  }
  const [aiOpen, setAiOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [usePersonalInfo, setUsePersonalInfo] = useState(() => {
    try { return localStorage.getItem('ai-use-personal-info') === 'true'; } catch { return false; }
  });
  const [showProfileInfo, setShowProfileInfo] = useState(false);
  const [profileData, setProfileData] = useState<Record<string, unknown> | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [aiText, setAiText] = useState('');

  // Computed-field plumbing. Pure no-op when formEnhancements.computed is {}.
  // The number renderer uses computedValues only as a fallback when the user
  // hasn't typed anything — clearing the input always restores the computation.
  // computedContext exposes applookup list props so { kind: 'applookup', ... }
  // operands can resolve to numeric fields on the target record.
  const computedContext = useMemo<ComputedContext>(() => ({
    lookupLists: {
      'repository': repositoriesList,
    },
  }), [repositoriesList, ]);
  const computedValues = useMemo<Record<string, number | null>>(() => {
    let out: Record<string, number | null> = {};
    const entries = Object.entries(formEnhancements.computed);
    for (let i = 0; i < 5; i++) {
      const merged: Record<string, unknown> = { ...(fields as Record<string, unknown>) };
      for (const [k, v] of Object.entries(out)) {
        if (v === null) continue;
        const cur = merged[k];
        if (cur === undefined || cur === null || cur === '') merged[k] = v;
      }
      const next: Record<string, number | null> = {};
      let changed = false;
      for (const [key, spec] of entries) {
        const v = evalComputed(spec, merged, computedContext);
        next[key] = v;
        if (v !== out[key]) changed = true;
      }
      out = next;
      if (!changed) break;
    }
    return out;
  }, [fields, computedContext]);

  useEffect(() => {
    if (open) {
      setFields(applyDefaults((defaultValues ?? {}) as Record<string, unknown>, formEnhancements.defaults) as Partial<Issues['fields']>);
      setPreview(null);
      setScanSuccess(false);
      setAiText('');
    }
  }, [open, defaultValues]);
  useEffect(() => {
    try { localStorage.setItem('ai-use-personal-info', String(usePersonalInfo)); } catch {}
  }, [usePersonalInfo]);
  async function handleShowProfileInfo() {
    if (showProfileInfo) { setShowProfileInfo(false); return; }
    setProfileLoading(true);
    try {
      const p = await getUserProfile();
      setProfileData(p);
    } catch {
      setProfileData(null);
    } finally {
      setProfileLoading(false);
      setShowProfileInfo(true);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Fill empty number slots from computed values; user-typed values always win.
      // CRITICAL: only backend-mapped keys may be backfilled. Virtual computeds
      // (sub-agent invents `_netto`, `_bestellung_gesamtbetrag` etc. for the
      // "Berechnungen" display) have no backend counterpart — writing them
      // triggers a 422 from the Living-Apps API ("field does not exist").
      const merged = { ...fields };
      for (const [key, val] of Object.entries(computedValues)) {
        if (val === null) continue;
        if (!backendFieldSet.has(key)) continue;
        const cur = (merged as Record<string, unknown>)[key];
        if (cur === undefined || cur === null || cur === '') {
          (merged as Record<string, unknown>)[key] = val;
        }
      }
      const clean = cleanFieldsForApi(merged, 'issues');
      await onSubmit(clean as Issues['fields']);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleAiExtract(file?: File) {
    if (!file && !aiText.trim()) return;
    setScanning(true);
    setScanSuccess(false);
    try {
      let uri: string | undefined;
      let gps: { latitude: number; longitude: number } | null = null;
      let geoAddr = '';
      const parts: string[] = [];
      if (file) {
        const [dataUri, meta] = await Promise.all([fileToDataUri(file), extractPhotoMeta(file)]);
        uri = dataUri;
        if (file.type.startsWith('image/')) setPreview(uri);
        gps = enablePhotoLocation ? meta?.gps ?? null : null;
        if (gps) {
          geoAddr = await reverseGeocode(gps.latitude, gps.longitude);
          parts.push(`Location coordinates: ${gps.latitude}, ${gps.longitude}`);
          if (geoAddr) parts.push(`Reverse-geocoded address: ${geoAddr}`);
        }
        if (meta?.dateTime) {
          parts.push(`Date taken: ${meta.dateTime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')}`);
        }
      }
      const contextParts: string[] = [];
      if (parts.length) {
        contextParts.push(`<photo-metadata>\nThe following metadata was extracted from the photo\'s EXIF data:\n${parts.join('\n')}\n</photo-metadata>`);
      }
      contextParts.push(`<available-records field="repository" entity="Repositories">\n${JSON.stringify(repositoriesList.map(r => ({ record_id: r.record_id, ...r.fields })), null, 2)}\n</available-records>`);
      if (usePersonalInfo) {
        try {
          const profile = await getUserProfile();
          contextParts.push(`<user-profile>\nThe following is the logged-in user\'s personal information. Use this to pre-fill relevant fields like name, email, address, company etc. when appropriate:\n${JSON.stringify(profile, null, 2)}\n</user-profile>`);
        } catch (err) {
          console.warn('Failed to fetch user profile:', err);
        }
      }
      const photoContext = contextParts.length ? contextParts.join('\n') : undefined;
      const schema = `{\n  "titel": string | null, // Titel\n  "beschreibung": string | null, // Beschreibung\n  "repository": string | null, // Display name from Repositories (see <available-records>)\n  "status": LookupValue | null, // Status (select one key: "offen" | "in_bearbeitung" | "geschlossen") mapping: offen=Offen, in_bearbeitung=In Bearbeitung, geschlossen=Geschlossen\n  "prioritaet": LookupValue | null, // Priorität (select one key: "niedrig" | "mittel" | "hoch" | "kritisch") mapping: niedrig=Niedrig, mittel=Mittel, hoch=Hoch, kritisch=Kritisch\n  "typ": LookupValue | null, // Typ (select one key: "fehler" | "feature" | "aufgabe" | "verbesserung") mapping: fehler=Fehler, feature=Feature, aufgabe=Aufgabe, verbesserung=Verbesserung\n  "labels": LookupValue[] | null, // Labels (select one or more keys: "bug" | "enhancement" | "documentation" | "question" | "help_wanted" | "good_first_issue" | "duplicate" | "wontfix") mapping: bug=Bug, enhancement=Enhancement, documentation=Documentation, question=Question, help_wanted=Help Wanted, good_first_issue=Good First Issue, duplicate=Duplicate, wontfix=Wontfix\n  "meilenstein": string | null, // Meilenstein\n  "faelligkeitsdatum": string | null, // YYYY-MM-DD\n  "bearbeiter_vorname": string | null, // Bearbeiter Vorname\n  "bearbeiter_nachname": string | null, // Bearbeiter Nachname\n  "melder_vorname": string | null, // Melder Vorname\n  "melder_nachname": string | null, // Melder Nachname\n  "erstellt_am": string | null, // YYYY-MM-DDTHH:MM\n}`;
      const raw = await extractFromInput<Record<string, unknown>>(schema, {
        dataUri: uri,
        userText: aiText.trim() || undefined,
        photoContext,
        intent: DIALOG_INTENT,
      });
      setFields(prev => {
        const merged = { ...prev } as Record<string, unknown>;
        function matchName(name: string, candidates: string[]): boolean {
          const n = name.toLowerCase().trim();
          return candidates.some(c => c.toLowerCase().includes(n) || n.includes(c.toLowerCase()));
        }
        const applookupKeys = new Set<string>(["repository"]);
        for (const [k, v] of Object.entries(raw)) {
          if (applookupKeys.has(k)) continue;
          if (v != null) merged[k] = v;
        }
        const repositoryName = raw['repository'] as string | null;
        if (repositoryName) {
          const repositoryMatch = repositoriesList.find(r => matchName(repositoryName!, [String(r.fields.name ?? '')]));
          if (repositoryMatch) merged['repository'] = createRecordUrl(APP_IDS.REPOSITORIES, repositoryMatch.record_id);
        }
        return merged as Partial<Issues['fields']>;
      });
      setAiText('');
      setScanSuccess(true);
      setTimeout(() => setScanSuccess(false), 3000);
    } catch (err) {
      console.error('Scan fehlgeschlagen:', err);
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleAiExtract(f);
    e.target.value = '';
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
      handleAiExtract(file);
    }
  }, []);

  const DIALOG_INTENT = defaultValues ? 'Issues bearbeiten' : 'Issues hinzufügen';

  const fieldBlocks: Record<string, React.ReactNode> = {
    'titel': (
      <div key="titel" className="space-y-1.5">
        <Label htmlFor="titel">Titel</Label>
        <Input
          id="titel"
          placeholder="z. B. Fehler beim Form-Submit"
          value={fields.titel ?? ''}
          onChange={e => setFields(f => ({ ...f, titel: e.target.value }))}
        />
      </div>
    ),
    'beschreibung': (
      <div key="beschreibung" className="space-y-1.5">
        <Label htmlFor="beschreibung">Beschreibung</Label>
        <Textarea
          id="beschreibung"
          placeholder="Problembeschreibung, Schritte zum Reproduzieren..."
          value={fields.beschreibung ?? ''}
          onChange={e => setFields(f => ({ ...f, beschreibung: e.target.value }))}
          rows={3}
        />
      </div>
    ),
    'repository': (
      <div key="repository" className="space-y-1.5">
        <Label htmlFor="repository">Repository</Label>
        <Combobox
          id="repository"
          placeholder="Welches Repository?"
          items={repositoriesListAll.map(r => ({
            id: r.record_id,
            label: String(r.fields.name ?? r.record_id),
          }))}
          value={extractRecordId(fields.repository)}
          onChange={id => setFields(f => ({ ...f, repository: id ? createRecordUrl(APP_IDS.REPOSITORIES, id) : undefined }))}
          searchPlaceholder="Suchen…"
          emptyText="Kein Treffer"
          onCreateNew={(q) => openCreateRepositories("repository", q)}
          createLabel="Neu in Repositories"
        />
      </div>
    ),
    'status': (
      <div key="status" className="space-y-1.5">
        <Label htmlFor="status">Status</Label>
        <div role="radiogroup" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.status) === 'offen'}
            onClick={() => setFields(f => ({ ...f, status: (lookupKey(f.status) === 'offen' ? undefined : 'offen') as any }))}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.status) === 'offen'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            Offen
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.status) === 'in_bearbeitung'}
            onClick={() => setFields(f => ({ ...f, status: (lookupKey(f.status) === 'in_bearbeitung' ? undefined : 'in_bearbeitung') as any }))}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.status) === 'in_bearbeitung'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            In Bearbeitung
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.status) === 'geschlossen'}
            onClick={() => setFields(f => ({ ...f, status: (lookupKey(f.status) === 'geschlossen' ? undefined : 'geschlossen') as any }))}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.status) === 'geschlossen'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            Geschlossen
          </button>
        </div>
      </div>
    ),
    'prioritaet': (
      <div key="prioritaet" className="space-y-1.5">
        <Label htmlFor="prioritaet">Priorität</Label>
        <div role="radiogroup" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.prioritaet) === 'niedrig'}
            onClick={() => setFields(f => ({ ...f, prioritaet: (lookupKey(f.prioritaet) === 'niedrig' ? undefined : 'niedrig') as any }))}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.prioritaet) === 'niedrig'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            Niedrig
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.prioritaet) === 'mittel'}
            onClick={() => setFields(f => ({ ...f, prioritaet: (lookupKey(f.prioritaet) === 'mittel' ? undefined : 'mittel') as any }))}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.prioritaet) === 'mittel'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            Mittel
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.prioritaet) === 'hoch'}
            onClick={() => setFields(f => ({ ...f, prioritaet: (lookupKey(f.prioritaet) === 'hoch' ? undefined : 'hoch') as any }))}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.prioritaet) === 'hoch'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            Hoch
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.prioritaet) === 'kritisch'}
            onClick={() => setFields(f => ({ ...f, prioritaet: (lookupKey(f.prioritaet) === 'kritisch' ? undefined : 'kritisch') as any }))}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.prioritaet) === 'kritisch'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            Kritisch
          </button>
        </div>
      </div>
    ),
    'typ': (
      <div key="typ" className="space-y-1.5">
        <Label htmlFor="typ">Typ</Label>
        <div role="radiogroup" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.typ) === 'fehler'}
            onClick={() => setFields(f => ({ ...f, typ: (lookupKey(f.typ) === 'fehler' ? undefined : 'fehler') as any }))}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.typ) === 'fehler'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            Fehler
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.typ) === 'feature'}
            onClick={() => setFields(f => ({ ...f, typ: (lookupKey(f.typ) === 'feature' ? undefined : 'feature') as any }))}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.typ) === 'feature'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            Feature
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.typ) === 'aufgabe'}
            onClick={() => setFields(f => ({ ...f, typ: (lookupKey(f.typ) === 'aufgabe' ? undefined : 'aufgabe') as any }))}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.typ) === 'aufgabe'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            Aufgabe
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.typ) === 'verbesserung'}
            onClick={() => setFields(f => ({ ...f, typ: (lookupKey(f.typ) === 'verbesserung' ? undefined : 'verbesserung') as any }))}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.typ) === 'verbesserung'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            Verbesserung
          </button>
        </div>
      </div>
    ),
    'labels': (
      <div key="labels" className="space-y-1.5">
        <Label htmlFor="labels">Labels</Label>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="labels_bug"
              checked={lookupKeys(fields.labels).includes('bug')}
              onCheckedChange={(checked) => {
                setFields(f => {
                  const current = lookupKeys(f.labels);
                  const next = checked ? [...current, 'bug'] : current.filter(k => k !== 'bug');
                  return { ...f, labels: next.length ? next as any : undefined };
                });
              }}
            />
            <Label htmlFor="labels_bug" className="font-normal">Bug</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="labels_enhancement"
              checked={lookupKeys(fields.labels).includes('enhancement')}
              onCheckedChange={(checked) => {
                setFields(f => {
                  const current = lookupKeys(f.labels);
                  const next = checked ? [...current, 'enhancement'] : current.filter(k => k !== 'enhancement');
                  return { ...f, labels: next.length ? next as any : undefined };
                });
              }}
            />
            <Label htmlFor="labels_enhancement" className="font-normal">Enhancement</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="labels_documentation"
              checked={lookupKeys(fields.labels).includes('documentation')}
              onCheckedChange={(checked) => {
                setFields(f => {
                  const current = lookupKeys(f.labels);
                  const next = checked ? [...current, 'documentation'] : current.filter(k => k !== 'documentation');
                  return { ...f, labels: next.length ? next as any : undefined };
                });
              }}
            />
            <Label htmlFor="labels_documentation" className="font-normal">Documentation</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="labels_question"
              checked={lookupKeys(fields.labels).includes('question')}
              onCheckedChange={(checked) => {
                setFields(f => {
                  const current = lookupKeys(f.labels);
                  const next = checked ? [...current, 'question'] : current.filter(k => k !== 'question');
                  return { ...f, labels: next.length ? next as any : undefined };
                });
              }}
            />
            <Label htmlFor="labels_question" className="font-normal">Question</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="labels_help_wanted"
              checked={lookupKeys(fields.labels).includes('help_wanted')}
              onCheckedChange={(checked) => {
                setFields(f => {
                  const current = lookupKeys(f.labels);
                  const next = checked ? [...current, 'help_wanted'] : current.filter(k => k !== 'help_wanted');
                  return { ...f, labels: next.length ? next as any : undefined };
                });
              }}
            />
            <Label htmlFor="labels_help_wanted" className="font-normal">Help Wanted</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="labels_good_first_issue"
              checked={lookupKeys(fields.labels).includes('good_first_issue')}
              onCheckedChange={(checked) => {
                setFields(f => {
                  const current = lookupKeys(f.labels);
                  const next = checked ? [...current, 'good_first_issue'] : current.filter(k => k !== 'good_first_issue');
                  return { ...f, labels: next.length ? next as any : undefined };
                });
              }}
            />
            <Label htmlFor="labels_good_first_issue" className="font-normal">Good First Issue</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="labels_duplicate"
              checked={lookupKeys(fields.labels).includes('duplicate')}
              onCheckedChange={(checked) => {
                setFields(f => {
                  const current = lookupKeys(f.labels);
                  const next = checked ? [...current, 'duplicate'] : current.filter(k => k !== 'duplicate');
                  return { ...f, labels: next.length ? next as any : undefined };
                });
              }}
            />
            <Label htmlFor="labels_duplicate" className="font-normal">Duplicate</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="labels_wontfix"
              checked={lookupKeys(fields.labels).includes('wontfix')}
              onCheckedChange={(checked) => {
                setFields(f => {
                  const current = lookupKeys(f.labels);
                  const next = checked ? [...current, 'wontfix'] : current.filter(k => k !== 'wontfix');
                  return { ...f, labels: next.length ? next as any : undefined };
                });
              }}
            />
            <Label htmlFor="labels_wontfix" className="font-normal">Wontfix</Label>
          </div>
        </div>
      </div>
    ),
    'meilenstein': (
      <div key="meilenstein" className="space-y-1.5">
        <Label htmlFor="meilenstein">Meilenstein</Label>
        <Input
          id="meilenstein"
          placeholder="z. B. v2.0"
          value={fields.meilenstein ?? ''}
          onChange={e => setFields(f => ({ ...f, meilenstein: e.target.value }))}
        />
      </div>
    ),
    'faelligkeitsdatum': (
      <div key="faelligkeitsdatum" className="space-y-1.5">
        <Label htmlFor="faelligkeitsdatum">Fälligkeitsdatum</Label>
        <DatePicker
          id="faelligkeitsdatum"
          placeholder="Bis wann soll es erledigt sein?"
          mode="date"
          value={fields.faelligkeitsdatum ?? null}
          onChange={v => setFields(f => ({ ...f, faelligkeitsdatum: v ?? undefined }))}
        />
      </div>
    ),
    'bearbeiter_vorname': (
      <div key="bearbeiter_vorname" className="space-y-1.5">
        <Label htmlFor="bearbeiter_vorname">Bearbeiter Vorname</Label>
        <Input
          id="bearbeiter_vorname"
          placeholder="z. B. Max"
          value={fields.bearbeiter_vorname ?? ''}
          onChange={e => setFields(f => ({ ...f, bearbeiter_vorname: e.target.value }))}
        />
      </div>
    ),
    'bearbeiter_nachname': (
      <div key="bearbeiter_nachname" className="space-y-1.5">
        <Label htmlFor="bearbeiter_nachname">Bearbeiter Nachname</Label>
        <Input
          id="bearbeiter_nachname"
          placeholder="z. B. Mustermann"
          value={fields.bearbeiter_nachname ?? ''}
          onChange={e => setFields(f => ({ ...f, bearbeiter_nachname: e.target.value }))}
        />
      </div>
    ),
    'melder_vorname': (
      <div key="melder_vorname" className="space-y-1.5">
        <Label htmlFor="melder_vorname">Melder Vorname</Label>
        <Input
          id="melder_vorname"
          placeholder="z. B. Anna"
          value={fields.melder_vorname ?? ''}
          onChange={e => setFields(f => ({ ...f, melder_vorname: e.target.value }))}
        />
      </div>
    ),
    'melder_nachname': (
      <div key="melder_nachname" className="space-y-1.5">
        <Label htmlFor="melder_nachname">Melder Nachname</Label>
        <Input
          id="melder_nachname"
          placeholder="z. B. Schmidt"
          value={fields.melder_nachname ?? ''}
          onChange={e => setFields(f => ({ ...f, melder_nachname: e.target.value }))}
        />
      </div>
    ),
    'erstellt_am': (
      <div key="erstellt_am" className="space-y-1.5">
        <Label htmlFor="erstellt_am">Erstellt am</Label>
        <DatePicker
          id="erstellt_am"
          placeholder="Zeitpunkt der Erstellung"
          mode="datetime"
          value={fields.erstellt_am ?? null}
          onChange={v => setFields(f => ({ ...f, erstellt_am: v ?? undefined }))}
        />
      </div>
    ),
  };
  const orderedFields = applyFieldOrder(Object.keys(fieldBlocks), formEnhancements.fieldOrder);
  const orderedFieldsKey = orderedFields.map((it) => typeof it === 'string' ? it : it.row.join('+')).join(',');

  // Render-Modell für Computed-Felder:
  //
  //   • BACKEND-FELDER mit computed-Eintrag (z.B. gesamtpreis bei einer
  //     Katzenpension) bleiben als normales Eingabe-Feld stehen. Der Number-
  //     Input nutzt den computed-Wert als Vorschlag, der User kann jederzeit
  //     überschreiben (clearing → restore computed).
  //   • VIRTUELLE computed-Keys (Eintrag in formEnhancements.computed, ABER
  //     kein passendes Backend-Feld in orderedFields) erscheinen NICHT als
  //     Input, sondern unten als kompakte 'Berechnungen'-Übersicht oder als
  //     Inline-Hint unter dem letzten beitragenden Input.
  const FIELD_LABELS: Record<string, string> = {"titel": "Titel", "beschreibung": "Beschreibung", "repository": "Repository", "status": "Status", "prioritaet": "Priorität", "typ": "Typ", "labels": "Labels", "meilenstein": "Meilenstein", "faelligkeitsdatum": "Fälligkeitsdatum", "bearbeiter_vorname": "Bearbeiter Vorname", "bearbeiter_nachname": "Bearbeiter Nachname", "melder_vorname": "Melder Vorname", "melder_nachname": "Melder Nachname", "erstellt_am": "Erstellt am"};
  const CURRENCY_KEYS = new Set<string>([]);
  // Applookup-Referenz-Labels: pro applookup-Feld in dieser Form (ownKey)
  // eine Map { lookupKey: label } für ALLE Felder des Target-Schemas. Wird
  // beim Render-Walk gefiltert auf die in der computed-Formel tatsächlich
  // referenzierten lookupKeys (siehe applookupRefs unten).
  const APPLOOKUP_LABELS: Record<string, Record<string, string>> = {"repository": {"name": "Repository-Name", "beschreibung": "Beschreibung", "url": "Repository-URL", "inhaber": "Inhaber / Organisation", "sichtbarkeit": "Sichtbarkeit", "erstellungsdatum": "Erstellungsdatum"}};
  const inputFields = useMemo(() => flattenFieldOrder(orderedFields), [orderedFieldsKey]);
  const backendFieldSet = useMemo(() => new Set(inputFields), [inputFields.join(',')]);
  const virtualComputed = useMemo(
    () => Object.fromEntries(
      Object.entries(formEnhancements.computed).filter(([k]) => !backendFieldSet.has(k)),
    ),
    [backendFieldSet],
  );
  const virtualFormEnhancements = useMemo(
    () => ({ ...formEnhancements, computed: virtualComputed }),
    [virtualComputed],
  );
  const computedLayout = useMemo(
    () => classifyComputed(virtualFormEnhancements, inputFields, computedDeps),
    [virtualFormEnhancements, inputFields.join(',')],
  );
  // Applookup-Referenzen: pro ownKey (Lookup-Feld im Form) die Liste der
  // lookupKeys, die in irgendeiner computed-Formel referenziert werden.
  // MODUS-1: aus dem Spec-Tree extrahiert. MODUS-2: aus dem Build-Time-
  // Export computedApplookupRefs (parse-formulas hat Regex-Pairs gesammelt).
  // Pro (ownKey, lookupKey)-Paar nur einmal; pro ownKey können aber mehrere
  // lookupKeys gleichzeitig auftauchen (z.B. einzelpreis UND karten10_preis
  // beim Yoga-Kurs), und alle werden separat als Inline-Hint gerendert.
  const applookupRefs = useMemo(
    () => mergeApplookupRefs(
      extractApplookupRefs(formEnhancements.computed),
      computedApplookupRefs,
    ),
    [],
  );
  function summaryLabel(k: string): string {
    if (FIELD_LABELS[k]) return FIELD_LABELS[k];
    // Leading underscore(s) als Virtual-Marker abstreifen; Unterstriche zu
    // Leerzeichen, jedes Wort kapitalisieren. Umlaute kommen vom Sub-Agent
    // direkt im Key (z. B. `_buchung_dauer_nächte`) — JS/TS/Vite unterstützen
    // Unicode-Identifier nativ, daher keine ASCII-Transliteration nötig.
    return k.replace(/^_+/, '')
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  function formatSummaryValue(k: string, v: unknown): string {
    if (v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) return '—';
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return String(v);
    // Backend-Feld mit €-Label ODER virtueller Computed-Key, dessen Name nach Geld aussieht.
    const looksLikeCurrency = CURRENCY_KEYS.has(k) || /(?:kosten|preis|betrag|gesamt|netto|brutto|summe|mwst|rabatt|anzahlung|umsatz|saldo)/i.test(k);
    if (looksLikeCurrency) {
      return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  }

  return (
    <>
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b flex flex-row items-center gap-3 space-y-0">
          <DialogTitle className="flex-1 truncate text-left">{DIALOG_INTENT}</DialogTitle>
          {enablePhotoScan && (
            <button
              type="button"
              onClick={() => setAiOpen(o => !o)}
              aria-expanded={aiOpen}
              aria-controls="ai-fill-panel"
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all mr-7 shadow-sm ${
                aiOpen
                  ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                  : 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary/15 hover:border-primary/50'
              }`}
            >
              <IconSparkles className={`h-3.5 w-3.5 ${aiOpen ? '' : 'text-primary'}`} />
              <span className="hidden sm:inline">KI-Ausfüllen</span>
              <IconChevronDown className={`h-3 w-3 transition-transform ${aiOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </DialogHeader>
        {enablePhotoScan && aiOpen && (
          <div id="ai-fill-panel" className="border-b bg-muted/20 px-6 py-4 space-y-3">
            <p className="text-xs text-muted-foreground">Versteht Fotos, Dokumente und Text und füllt alles für dich aus</p>
            <div className="flex items-start gap-2 pl-0.5">
              <Checkbox
                id="ai-use-personal-info"
                checked={usePersonalInfo}
                onCheckedChange={(v) => setUsePersonalInfo(!!v)}
                className="mt-0.5"
              />
              <span className="text-xs text-muted-foreground leading-snug">
                <Label htmlFor="ai-use-personal-info" className="text-xs font-normal text-muted-foreground cursor-pointer inline">
                  KI-Assistent darf zusätzlich Informationen zu meiner Person verwenden
                </Label>
                {' '}
                <button type="button" onClick={handleShowProfileInfo} className="text-xs text-primary hover:underline whitespace-nowrap">
                  {profileLoading ? 'Lade...' : '(mehr Infos)'}
                </button>
              </span>
            </div>
            {showProfileInfo && (
              <div className="rounded-md border bg-muted/50 p-2 text-xs max-h-40 overflow-y-auto">
                <p className="font-medium mb-1">Folgende Infos über dich können von der KI genutzt werden:</p>
                {profileData ? Object.values(profileData).map((v, i) => (
                  <span key={i}>{i > 0 && ", "}{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                )) : (
                  <span className="text-muted-foreground">Profil konnte nicht geladen werden</span>
                )}
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileSelect} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !scanning && fileInputRef.current?.click()}
              className={`
                relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer
                ${scanning
                  ? 'border-primary/40 bg-primary/5'
                  : scanSuccess
                    ? 'border-green-500/40 bg-green-50/50 dark:bg-green-950/20'
                    : dragOver
                      ? 'border-primary bg-primary/10 scale-[1.01]'
                      : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
                }
              `}
            >
              {scanning ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <IconLoader2 className="h-7 w-7 text-primary animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">KI analysiert...</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Felder werden automatisch ausgefüllt</p>
                  </div>
                </div>
              ) : scanSuccess ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <IconCircleCheck className="h-7 w-7 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">Felder ausgefüllt!</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Prüfe die Werte und passe sie ggf. an</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="h-14 w-14 rounded-full bg-primary/8 flex items-center justify-center">
                    <IconPhotoPlus className="h-7 w-7 text-primary/70" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">Foto oder Dokument hierher ziehen oder auswählen</p>
                  </div>
                </div>
              )}

              {preview && !scanning && (
                <div className="absolute top-2 right-2">
                  <div className="relative group">
                    <img src={preview} alt="" className="h-10 w-10 rounded-md object-cover border shadow-sm" />
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setPreview(null); }}
                      className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-muted-foreground/80 text-white flex items-center justify-center"
                    >
                      <IconX className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button type="button" variant="outline" size="sm" className="h-10 text-xs" disabled={scanning}
                onClick={e => { e.stopPropagation(); cameraInputRef.current?.click(); }}>
                <IconCamera className="h-3.5 w-3.5 mr-1" />Kamera
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-10 text-xs" disabled={scanning}
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                <IconUpload className="h-3.5 w-3.5 mr-1" />Foto wählen
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-10 text-xs" disabled={scanning}
                onClick={e => {
                  e.stopPropagation();
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = 'application/pdf,.pdf';
                    fileInputRef.current.click();
                    setTimeout(() => { if (fileInputRef.current) fileInputRef.current.accept = 'image/*,application/pdf'; }, 100);
                  }
                }}>
                <IconFileText className="h-3.5 w-3.5 mr-1" />Dokument
              </Button>
            </div>

            <div className="relative">
              <Textarea
                placeholder="Text eingeben oder einfügen, z.B. Notizen, E-Mails, Beschreibungen..."
                value={aiText}
                onChange={e => {
                  setAiText(e.target.value);
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = Math.min(Math.max(el.scrollHeight, 56), 96) + 'px';
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && aiText.trim() && !scanning) {
                    e.preventDefault();
                    handleAiExtract();
                  }
                }}
                disabled={scanning}
                rows={2}
                className="pr-12 resize-none text-sm overflow-y-auto"
              />
              <button
                type="button"
                className="absolute right-2 top-2 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                disabled={scanning}
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) setAiText(prev => prev ? prev + '\n' + text : text);
                  } catch {}
                }}
                title="Paste"
              >
                <IconClipboard className="h-4 w-4" />
              </button>
            </div>
            {aiText.trim() && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-9 text-xs"
                disabled={scanning}
                onClick={() => handleAiExtract()}
              >
                <IconSparkles className="h-3.5 w-3.5 mr-1.5" />Analysieren
              </Button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col min-h-0 min-w-0">
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 space-y-4 min-w-0">
            {(() => {
              const renderField = (k: string) => {
                const inlineHints = computedLayout.anchors[k] ?? [];
                const refs = applookupRefs[k] ?? [];
                return (
                  <div key={k} className="space-y-1.5 min-w-0">
                    {fieldBlocks[k]}
                    {refs.map(({ lookupKey }) => {
                      // Show the live numeric value the formula will pull from
                      // the selected lookup target (e.g. "Monatspreis: 34,90 €"
                      // under the Tarif combobox). Hidden while no lookup is
                      // selected or the target field is non-numeric.
                      const v = resolveApplookupRef(k, lookupKey, fields as Record<string, unknown>, computedContext);
                      if (v === null) return null;
                      const lbl = APPLOOKUP_LABELS[k]?.[lookupKey] ?? lookupKey;
                      const text = formatSummaryValue(lookupKey, v);
                      return (
                        <div key={`alh-${k}-${lookupKey}`} className="flex items-center gap-1.5 pl-3 text-xs text-muted-foreground">
                          <span className="text-primary/70">→</span>
                          <span>{lbl}</span>
                          <span className="ml-auto font-medium tabular-nums text-foreground">{text}</span>
                        </div>
                      );
                    })}
                    {inlineHints.map((cKey) => {
                      const v = computedValues[cKey];
                      const text = formatSummaryValue(cKey, v);
                      if (text === '—') return null;
                      return (
                        <div key={cKey} className="flex items-center gap-1.5 pl-3 text-xs text-muted-foreground">
                          <span className="text-primary/70">→</span>
                          <span>{summaryLabel(cKey)}</span>
                          <span className="ml-auto font-medium tabular-nums text-foreground">{text}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              };
              return orderedFields.map((item, idx) => {
                if (typeof item === 'string') return renderField(item);
                const cols = item.cols ?? `repeat(${item.row.length}, minmax(0, 1fr))`;
                return (
                  <div key={`row-${idx}`} className="grid gap-3" style={{ gridTemplateColumns: cols }}>
                    {item.row.map(renderField)}
                  </div>
                );
              });
            })()}
            {(computedLayout.aggregates.length > 0 || computedLayout.finalTotal) && (
              <div className="mt-6 pt-4 border-t border-border space-y-1.5">
                {computedLayout.aggregates.length > 0 && (
                  <dl className="space-y-1.5 pb-2">
                    {computedLayout.aggregates.map((k) => {
                      const userVal = (fields as Record<string, unknown>)[k];
                      const computed = computedValues[k];
                      const v = userVal !== undefined && userVal !== null && userVal !== '' ? userVal : computed;
                      return (
                        <div key={k} className="flex justify-between items-baseline gap-3">
                          <dt className="text-sm text-muted-foreground truncate">{summaryLabel(k)}</dt>
                          <dd className="text-sm font-medium tabular-nums whitespace-nowrap">{formatSummaryValue(k, v)}</dd>
                        </div>
                      );
                    })}
                  </dl>
                )}
                {computedLayout.finalTotal && (() => {
                  const k = computedLayout.finalTotal;
                  const userVal = (fields as Record<string, unknown>)[k];
                  const computed = computedValues[k];
                  const v = userVal !== undefined && userVal !== null && userVal !== '' ? userVal : computed;
                  // Innere Border nur wenn aggregates existieren — sonst hätten wir
                  // zwei direkt aufeinanderfolgende Striche (Outer + Inner) mit nur
                  // einer Aggregat-Zeile dazwischen → zu viel visuelles Rauschen.
                  const sep = computedLayout.aggregates.length > 0 ? 'pt-3 border-t border-border' : 'pt-1';
                  return (
                    <div className={`flex justify-between items-baseline gap-3 ${sep}`}>
                      <span className="text-base font-semibold text-foreground">{summaryLabel(k)}</span>
                      <span className="text-lg font-bold tabular-nums whitespace-nowrap text-foreground">{formatSummaryValue(k, v)}</span>
                    </div>
                  );
                })()}
              </div>
            )}
            {recordId && (
              <div className="pt-2 border-t border-border">
                <AttachmentsSection appId={APP_IDS.ISSUES} recordId={recordId} />
              </div>
            )}
          </div>
          <DialogFooter className="sticky bottom-0 border-t bg-background/95 backdrop-blur px-6 py-3 gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Abbrechen</Button>
            <Button
              type="submit"
              disabled={saving || !isDirty}
            >
              {saving ? 'Speichern...' : defaultValues ? 'Speichern' : 'Erstellen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {createRepositoriesOpen && (
      <RepositoriesDialog
        open={createRepositoriesOpen}
        onClose={() => setCreateRepositoriesOpen(false)}
        onSubmit={async (newFields) => {
          const result = await LivingAppsService.createRepositorie(newFields as any) as { id?: string };
          if (result?.id) {
            const newRec = { record_id: result.id, fields: newFields } as unknown as Repositories;
            setExtraRepositories(prev => [...prev, newRec]);
            const url = createRecordUrl(APP_IDS.REPOSITORIES, result.id);
            setFields(prev => ({ ...prev, [createRepositoriesField]: url } as any));
          }
          setCreateRepositoriesOpen(false);
        }}
        defaultValues={createRepositoriesInitial
          ? ({ name: createRepositoriesInitial } as any)
          : undefined}
      />
    )}
    </>
  );
}