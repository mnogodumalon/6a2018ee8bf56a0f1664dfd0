import type { EnrichedIssues, EnrichedKommentare } from '@/types/enriched';
import type { Issues, Kommentare, Repositories } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface IssuesMaps {
  repositoriesMap: Map<string, Repositories>;
}

export function enrichIssues(
  issues: Issues[],
  maps: IssuesMaps
): EnrichedIssues[] {
  return issues.map(r => ({
    ...r,
    repositoryName: resolveDisplay(r.fields.repository, maps.repositoriesMap, 'name'),
  }));
}

interface KommentareMaps {
  issuesMap: Map<string, Issues>;
}

export function enrichKommentare(
  kommentare: Kommentare[],
  maps: KommentareMaps
): EnrichedKommentare[] {
  return kommentare.map(r => ({
    ...r,
    issueName: resolveDisplay(r.fields.issue, maps.issuesMap, 'titel'),
  }));
}
