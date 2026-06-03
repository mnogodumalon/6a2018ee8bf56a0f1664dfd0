import type { Issues, Kommentare } from './app';

export type EnrichedIssues = Issues & {
  repositoryName: string;
};

export type EnrichedKommentare = Kommentare & {
  issueName: string;
};
