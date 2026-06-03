import type { Kommentare, Issues } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { APP_IDS } from '@/types/app';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { IconPencil } from '@tabler/icons-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

function formatDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd.MM.yyyy', { locale: de }); } catch { return d; }
}

interface KommentareViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: Kommentare | null;
  onEdit: (record: Kommentare) => void;
  issuesList: Issues[];
}

export function KommentareViewDialog({ open, onClose, record, onEdit, issuesList }: KommentareViewDialogProps) {
  function getIssuesDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return issuesList.find(r => r.record_id === id)?.fields.titel ?? '—';
  }

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kommentare anzeigen</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            Bearbeiten
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Issue</Label>
            <p className="text-sm">{getIssuesDisplayName(record.fields.issue)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Kommentar</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.kommentar_text ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Autor Vorname</Label>
            <p className="text-sm">{record.fields.autor_vorname ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Autor Nachname</Label>
            <p className="text-sm">{record.fields.autor_nachname ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Erstellt am</Label>
            <p className="text-sm">{formatDate(record.fields.erstellt_am)}</p>
          </div>
          <div className="pt-2 border-t border-border">
            <AttachmentsSection appId={APP_IDS.KOMMENTARE} recordId={record.record_id} readOnly />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}