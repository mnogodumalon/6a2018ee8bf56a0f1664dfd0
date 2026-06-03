import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichIssues } from '@/lib/enrich';
import type { EnrichedIssues } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { formatDate } from '@/lib/formatters';
import { useState, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/StatCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { IssuesDialog } from '@/components/dialogs/IssuesDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import {
  IconAlertCircle,
  IconTool,
  IconRefresh,
  IconCheck,
  IconPlus,
  IconPencil,
  IconTrash,
  IconGitBranch,
  IconCircle,
  IconCircleDot,
  IconCircleCheck,
  IconAlertTriangle,
  IconFlag,
  IconCalendar,
  IconUser,
  IconTag,
  IconFilter,
} from '@tabler/icons-react';

const APPGROUP_ID = '6a2018ee8bf56a0f1664dfd0';
const REPAIR_ENDPOINT = '/claude/build/repair';

const STATUS_COLUMNS = [
  { key: 'offen', label: 'Offen', icon: IconCircle, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800' },
  { key: 'in_bearbeitung', label: 'In Bearbeitung', icon: IconCircleDot, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800' },
  { key: 'geschlossen', label: 'Geschlossen', icon: IconCircleCheck, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-200 dark:border-green-800' },
];

const PRIORITY_CONFIG: Record<string, { color: string; icon: typeof IconFlag }> = {
  kritisch: { color: 'text-red-600', icon: IconFlag },
  hoch: { color: 'text-orange-500', icon: IconFlag },
  mittel: { color: 'text-yellow-500', icon: IconFlag },
  niedrig: { color: 'text-muted-foreground', icon: IconFlag },
};

const TYP_COLOR: Record<string, string> = {
  fehler: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  feature: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  aufgabe: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  verbesserung: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
};

function getPriorityKey(issue: EnrichedIssues): string {
  const p = issue.fields.prioritaet;
  if (!p) return 'niedrig';
  return typeof p === 'object' && 'key' in p ? (p as { key: string }).key : String(p);
}

function getTypKey(issue: EnrichedIssues): string {
  const t = issue.fields.typ;
  if (!t) return '';
  return typeof t === 'object' && 'key' in t ? (t as { key: string }).key : String(t);
}

function getTypLabel(issue: EnrichedIssues): string {
  const t = issue.fields.typ;
  if (!t) return '';
  return typeof t === 'object' && 'label' in t ? (t as { label: string }).label : String(t);
}

export default function DashboardOverview() {
  const {
    repositories, issues, kommentare,
    repositoriesMap, issuesMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedIssues = enrichIssues(issues, { repositoriesMap });

  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editIssue, setEditIssue] = useState<EnrichedIssues | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EnrichedIssues | null>(null);
  const [presetStatus, setPresetStatus] = useState<string | undefined>(undefined);

  const filteredIssues = useMemo(() => {
    if (selectedRepo === 'all') return enrichedIssues;
    return enrichedIssues.filter(i => {
      const url = i.fields.repository;
      if (!url) return false;
      return url.includes(selectedRepo);
    });
  }, [enrichedIssues, selectedRepo]);

  const issuesByStatus = useMemo(() => {
    const map: Record<string, EnrichedIssues[]> = { offen: [], in_bearbeitung: [], geschlossen: [] };
    for (const issue of filteredIssues) {
      const s = issue.fields.status;
      const key = s && typeof s === 'object' && 'key' in s ? (s as { key: string }).key : (typeof s === 'string' ? s : '');
      if (key in map) map[key].push(issue);
      else map['offen'].push(issue);
    }
    return map;
  }, [filteredIssues]);

  const offeneKritisch = useMemo(() =>
    enrichedIssues.filter(i => {
      const sk = i.fields.status;
      const statusKey = sk && typeof sk === 'object' && 'key' in sk ? (sk as { key: string }).key : '';
      const pk = getPriorityKey(i);
      return statusKey !== 'geschlossen' && (pk === 'kritisch' || pk === 'hoch');
    }).length,
    [enrichedIssues]
  );

  const kommentarCountByIssue = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of kommentare) {
      const url = k.fields.issue;
      if (!url) continue;
      const match = String(url).match(/([a-f0-9]{24})$/i);
      const id = match ? match[1] : null;
      if (id) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [kommentare]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await LivingAppsService.deleteIssue(deleteTarget.record_id);
    setDeleteTarget(null);
    fetchAll();
  };

  const handleCreateWithStatus = (statusKey: string) => {
    setPresetStatus(statusKey);
    setCreateOpen(true);
  };

  const getDefaultValuesForCreate = () => {
    if (!presetStatus) return undefined;
    const opt = LOOKUP_OPTIONS['issues']?.['status']?.find(o => o.key === presetStatus);
    return opt ? { status: opt } : undefined;
  };

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  return (
    <div className="space-y-6">
      {/* KPI-Zeile */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Issues gesamt"
          value={String(enrichedIssues.length)}
          description="Alle Issues"
          icon={<IconCircleDot size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Offen"
          value={String(issuesByStatus['offen'].length + (selectedRepo !== 'all' ? 0 : 0))}
          description="Noch nicht gestartet"
          icon={<IconCircle size={18} className="text-blue-500" />}
        />
        <StatCard
          title="Kritisch / Hoch"
          value={String(offeneKritisch)}
          description="Hohe Priorität offen"
          icon={<IconAlertTriangle size={18} className="text-orange-500" />}
        />
        <StatCard
          title="Repositories"
          value={String(repositories.length)}
          description="Aktive Projekte"
          icon={<IconGitBranch size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <IconFilter size={16} className="text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground shrink-0">Repository:</span>
          <select
            value={selectedRepo}
            onChange={e => setSelectedRepo(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring min-w-0 max-w-xs truncate"
          >
            <option value="all">Alle Repositories</option>
            {repositories.map(r => (
              <option key={r.record_id} value={r.record_id}>
                {r.fields.name ?? r.record_id}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto">
          <Button size="sm" onClick={() => { setPresetStatus(undefined); setCreateOpen(true); }}>
            <IconPlus size={16} className="mr-1 shrink-0" />
            <span>Neues Issue</span>
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STATUS_COLUMNS.map(col => {
          const ColIcon = col.icon;
          const columnIssues = issuesByStatus[col.key] ?? [];
          return (
            <div key={col.key} className={`rounded-2xl border ${col.border} ${col.bg} overflow-hidden flex flex-col`}>
              {/* Column Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-inherit">
                <div className="flex items-center gap-2">
                  <ColIcon size={16} className={`${col.color} shrink-0`} />
                  <span className="font-semibold text-sm">{col.label}</span>
                  <span className="text-xs text-muted-foreground bg-background/60 rounded-full px-2 py-0.5 font-medium">
                    {columnIssues.length}
                  </span>
                </div>
                <button
                  onClick={() => handleCreateWithStatus(col.key)}
                  className="p-1 rounded-lg hover:bg-background/60 transition-colors"
                  title={`Neues Issue in "${col.label}"`}
                >
                  <IconPlus size={15} className="text-muted-foreground" />
                </button>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2 p-2 min-h-[120px]">
                {columnIssues.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <IconCircle size={24} stroke={1.5} className="mb-1 opacity-40" />
                    <span className="text-xs opacity-60">Keine Issues</span>
                  </div>
                )}
                {columnIssues.map(issue => {
                  const priorityKey = getPriorityKey(issue);
                  const priorityCfg = PRIORITY_CONFIG[priorityKey] ?? PRIORITY_CONFIG['niedrig'];
                  const PrioIcon = priorityCfg.icon;
                  const typKey = getTypKey(issue);
                  const typLabel = getTypLabel(issue);
                  const komCount = kommentarCountByIssue.get(issue.record_id) ?? 0;
                  const bearbeiter = [issue.fields.bearbeiter_vorname, issue.fields.bearbeiter_nachname].filter(Boolean).join(' ');

                  return (
                    <div
                      key={issue.record_id}
                      className="bg-background rounded-xl border border-border/60 p-3 flex flex-col gap-2 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
                      onClick={() => setEditIssue(issue)}
                    >
                      {/* Top row: typ + priority */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1 min-w-0">
                          {typKey && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium shrink-0 ${TYP_COLOR[typKey] ?? 'bg-muted text-muted-foreground'}`}>
                              {typLabel}
                            </span>
                          )}
                          {issue.fields.meilenstein && (
                            <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                              {issue.fields.meilenstein}
                            </span>
                          )}
                        </div>
                        <PrioIcon size={14} className={`${priorityCfg.color} shrink-0 mt-0.5`} stroke={2} />
                      </div>

                      {/* Title */}
                      <p className="text-sm font-medium line-clamp-2 leading-snug">
                        {issue.fields.titel ?? '(Kein Titel)'}
                      </p>

                      {/* Repository */}
                      {issue.repositoryName && (
                        <div className="flex items-center gap-1 min-w-0">
                          <IconGitBranch size={12} className="text-muted-foreground shrink-0" stroke={1.5} />
                          <span className="text-xs text-muted-foreground truncate">{issue.repositoryName}</span>
                        </div>
                      )}

                      {/* Labels */}
                      {issue.fields.labels && Array.isArray(issue.fields.labels) && issue.fields.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(issue.fields.labels as Array<{ key: string; label: string }>).slice(0, 3).map(l => (
                            <span key={l.key} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                              <IconTag size={10} stroke={1.5} />
                              {l.label}
                            </span>
                          ))}
                          {(issue.fields.labels as Array<{ key: string; label: string }>).length > 3 && (
                            <span className="text-xs text-muted-foreground">+{(issue.fields.labels as Array<unknown>).length - 3}</span>
                          )}
                        </div>
                      )}

                      {/* Footer row */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
                        <div className="flex items-center gap-2 min-w-0">
                          {bearbeiter && (
                            <div className="flex items-center gap-1 min-w-0">
                              <IconUser size={11} className="text-muted-foreground shrink-0" stroke={1.5} />
                              <span className="text-xs text-muted-foreground truncate max-w-[90px]">{bearbeiter}</span>
                            </div>
                          )}
                          {issue.fields.faelligkeitsdatum && (
                            <div className="flex items-center gap-1">
                              <IconCalendar size={11} className="text-muted-foreground shrink-0" stroke={1.5} />
                              <span className="text-xs text-muted-foreground">{formatDate(issue.fields.faelligkeitsdatum)}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {komCount > 0 && (
                            <span className="text-xs text-muted-foreground">{komCount} 💬</span>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); setEditIssue(issue); }}
                            className="p-1 rounded-md hover:bg-accent transition-colors"
                            title="Bearbeiten"
                          >
                            <IconPencil size={13} className="text-muted-foreground" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteTarget(issue); }}
                            className="p-1 rounded-md hover:bg-destructive/10 transition-colors"
                            title="Löschen"
                          >
                            <IconTrash size={13} className="text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Dialog */}
      <IssuesDialog
        open={createOpen}
        onClose={() => { setCreateOpen(false); setPresetStatus(undefined); }}
        onSubmit={async (fields) => {
          await LivingAppsService.createIssue(fields);
          fetchAll();
        }}
        defaultValues={getDefaultValuesForCreate()}
        recordId={undefined}
        repositoriesList={repositories}
        enablePhotoScan={AI_PHOTO_SCAN['Issues']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Issues']}
      />

      {/* Edit Dialog */}
      {editIssue && (
        <IssuesDialog
          open={!!editIssue}
          onClose={() => setEditIssue(null)}
          onSubmit={async (fields) => {
            await LivingAppsService.updateIssue(editIssue.record_id, fields);
            fetchAll();
          }}
          defaultValues={editIssue.fields}
          recordId={editIssue.record_id}
          repositoriesList={repositories}
          enablePhotoScan={AI_PHOTO_SCAN['Issues']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Issues']}
        />
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Issue löschen"
        description={`Soll "${deleteTarget?.fields.titel ?? 'dieses Issue'}" wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-9 w-28 ml-auto" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-96 rounded-2xl" />)}
      </div>
    </div>
  );
}

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState('');
  const [repairDone, setRepairDone] = useState(false);
  const [repairFailed, setRepairFailed] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    setRepairStatus('Reparatur wird gestartet...');
    setRepairFailed(false);

    const errorContext = JSON.stringify({
      type: 'data_loading',
      message: error.message,
      stack: (error.stack ?? '').split('\n').slice(0, 10).join('\n'),
      url: window.location.href,
    });

    try {
      const resp = await fetch(REPAIR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, error_context: errorContext }),
      });

      if (!resp.ok || !resp.body) {
        setRepairing(false);
        setRepairFailed(true);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          const content = line.slice(6);
          if (content.startsWith('[STATUS]')) {
            setRepairStatus(content.replace(/^\[STATUS]\s*/, ''));
          }
          if (content.startsWith('[DONE]')) {
            setRepairDone(true);
            setRepairing(false);
          }
          if (content.startsWith('[ERROR]') && !content.includes('Dashboard-Links')) {
            setRepairFailed(true);
          }
        }
      }
    } catch {
      setRepairing(false);
      setRepairFailed(true);
    }
  };

  if (repairDone) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <IconCheck size={22} className="text-green-500" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground mb-1">Dashboard repariert</h3>
          <p className="text-sm text-muted-foreground max-w-xs">Das Problem wurde behoben. Bitte laden Sie die Seite neu.</p>
        </div>
        <Button size="sm" onClick={() => window.location.reload()}>
          <IconRefresh size={14} className="mr-1" />Neu laden
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <IconAlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {repairing ? repairStatus : error.message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry} disabled={repairing}>Erneut versuchen</Button>
        <Button size="sm" onClick={handleRepair} disabled={repairing}>
          {repairing
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1" />
            : <IconTool size={14} className="mr-1" />}
          {repairing ? 'Reparatur läuft...' : 'Dashboard reparieren'}
        </Button>
      </div>
      {repairFailed && <p className="text-sm text-destructive">Automatische Reparatur fehlgeschlagen. Bitte kontaktieren Sie den Support.</p>}
    </div>
  );
}
