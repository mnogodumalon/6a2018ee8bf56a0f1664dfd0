import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/DatePicker';
import { lookupKey, lookupKeys } from '@/lib/formatters';

// Empty PROXY_BASE → relative URLs (dashboard and form-proxy share the domain).
const PROXY_BASE = '';
const APP_ID = '6a2018da19545f2ab61978ca';
const SUBMIT_PATH = `/rest/apps/${APP_ID}/records`;
const ALTCHA_SCRIPT_SRC = 'https://cdn.jsdelivr.net/npm/altcha/dist/altcha.min.js';

async function submitPublicForm(fields: Record<string, unknown>, captchaToken: string) {
  const res = await fetch(`${PROXY_BASE}/api${SUBMIT_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Captcha-Token': captchaToken,
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Submission failed');
  }
  return res.json();
}


function cleanFields(fields: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    if (typeof value === 'object' && !Array.isArray(value) && 'key' in (value as any)) {
      cleaned[key] = (value as any).key;
    } else if (Array.isArray(value)) {
      cleaned[key] = value.map(item =>
        typeof item === 'object' && item !== null && 'key' in item ? item.key : item
      );
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export default function PublicFormIssues() {
  const [fields, setFields] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captchaRef = useRef<HTMLElement | null>(null);

  // Load the ALTCHA web component script once per page.
  useEffect(() => {
    if (document.querySelector(`script[src="${ALTCHA_SCRIPT_SRC}"]`)) return;
    const s = document.createElement('script');
    s.src = ALTCHA_SCRIPT_SRC;
    s.defer = true;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    const qIdx = hash.indexOf('?');
    if (qIdx === -1) return;
    const params = new URLSearchParams(hash.slice(qIdx + 1));
    const prefill: Record<string, any> = {};
    params.forEach((value, key) => { prefill[key] = value; });
    if (Object.keys(prefill).length) setFields(prev => ({ ...prefill, ...prev }));
  }, []);

  function readCaptchaToken(): string | null {
    const el = captchaRef.current as any;
    if (!el) return null;
    return el.value || el.getAttribute('value') || null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = readCaptchaToken();
    if (!token) {
      setError('Bitte warte auf die Spam-Prüfung und versuche es erneut.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitPublicForm(cleanFields(fields), token);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Etwas ist schiefgelaufen. Bitte versuche es erneut.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold">Vielen Dank!</h2>
          <p className="text-muted-foreground">Deine Eingabe wurde erfolgreich übermittelt.</p>
          <Button variant="outline" className="mt-4" onClick={() => { setSubmitted(false); setFields({}); }}>
            Weitere Eingabe
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Issues — Formular</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 bg-card rounded-xl border border-border p-6 shadow-md">
          <div className="space-y-2">
            <Label htmlFor="titel">Titel</Label>
            <Input
              id="titel"
              placeholder=""
              value={fields.titel ?? ''}
              onChange={e => setFields(f => ({ ...f, titel: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="beschreibung">Beschreibung</Label>
            <Textarea
              id="beschreibung"
              placeholder=""
              value={fields.beschreibung ?? ''}
              onChange={e => setFields(f => ({ ...f, beschreibung: e.target.value }))}
              rows={3}
            />
          </div>
          <div className="space-y-2">
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
          <div className="space-y-2">
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
          <div className="space-y-2">
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
          <div className="space-y-2">
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
          <div className="space-y-2">
            <Label htmlFor="meilenstein">Meilenstein</Label>
            <Input
              id="meilenstein"
              placeholder=""
              value={fields.meilenstein ?? ''}
              onChange={e => setFields(f => ({ ...f, meilenstein: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="faelligkeitsdatum">Fälligkeitsdatum</Label>
            <DatePicker
              id="faelligkeitsdatum"
              placeholder=""
              mode="date"
              value={fields.faelligkeitsdatum ?? null}
              onChange={v => setFields(f => ({ ...f, faelligkeitsdatum: v ?? undefined }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bearbeiter_vorname">Bearbeiter Vorname</Label>
            <Input
              id="bearbeiter_vorname"
              placeholder=""
              value={fields.bearbeiter_vorname ?? ''}
              onChange={e => setFields(f => ({ ...f, bearbeiter_vorname: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bearbeiter_nachname">Bearbeiter Nachname</Label>
            <Input
              id="bearbeiter_nachname"
              placeholder=""
              value={fields.bearbeiter_nachname ?? ''}
              onChange={e => setFields(f => ({ ...f, bearbeiter_nachname: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="melder_vorname">Melder Vorname</Label>
            <Input
              id="melder_vorname"
              placeholder=""
              value={fields.melder_vorname ?? ''}
              onChange={e => setFields(f => ({ ...f, melder_vorname: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="melder_nachname">Melder Nachname</Label>
            <Input
              id="melder_nachname"
              placeholder=""
              value={fields.melder_nachname ?? ''}
              onChange={e => setFields(f => ({ ...f, melder_nachname: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="erstellt_am">Erstellt am</Label>
            <DatePicker
              id="erstellt_am"
              placeholder=""
              mode="datetime"
              value={fields.erstellt_am ?? null}
              onChange={v => setFields(f => ({ ...f, erstellt_am: v ?? undefined }))}
            />
          </div>

          <altcha-widget
            ref={captchaRef as any}
            challengeurl={`${PROXY_BASE}/api/_challenge?path=${encodeURIComponent(SUBMIT_PATH)}`}
            auto="onsubmit"
            hidefooter
          />

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Wird gesendet...' : 'Absenden'}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Powered by Klar
        </p>
      </div>
    </div>
  );
}
