import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Repositories, Issues, Kommentare } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

export function useDashboardData() {
  const [repositories, setRepositories] = useState<Repositories[]>([]);
  const [issues, setIssues] = useState<Issues[]>([]);
  const [kommentare, setKommentare] = useState<Kommentare[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [repositoriesData, issuesData, kommentareData] = await Promise.all([
        LivingAppsService.getRepositories(),
        LivingAppsService.getIssues(),
        LivingAppsService.getKommentare(),
      ]);
      setRepositories(repositoriesData);
      setIssues(issuesData);
      setKommentare(kommentareData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Silent background refresh (no loading state change → no flicker)
  useEffect(() => {
    async function silentRefresh() {
      try {
        const [repositoriesData, issuesData, kommentareData] = await Promise.all([
          LivingAppsService.getRepositories(),
          LivingAppsService.getIssues(),
          LivingAppsService.getKommentare(),
        ]);
        setRepositories(repositoriesData);
        setIssues(issuesData);
        setKommentare(kommentareData);
      } catch {
        // silently ignore — stale data is better than no data
      }
    }
    function handleRefresh() { void silentRefresh(); }
    window.addEventListener('dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('dashboard-refresh', handleRefresh);
  }, []);

  const repositoriesMap = useMemo(() => {
    const m = new Map<string, Repositories>();
    repositories.forEach(r => m.set(r.record_id, r));
    return m;
  }, [repositories]);

  const issuesMap = useMemo(() => {
    const m = new Map<string, Issues>();
    issues.forEach(r => m.set(r.record_id, r));
    return m;
  }, [issues]);

  return { repositories, setRepositories, issues, setIssues, kommentare, setKommentare, loading, error, fetchAll, repositoriesMap, issuesMap };
}