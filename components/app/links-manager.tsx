"use client";

import { Check, Copy, ExternalLink, Loader2, MoreVertical, Pencil, Plus, QrCode, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { createLinkAction, deleteLinkAction, updateLinkAction } from "@/app/(app)/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { downloadBlob } from "@/lib/download";

export interface LinkRow {
  id: string;
  token: string;
  label: string;
  enabled: boolean;
  expiresAt: string | null;
  maxGenerations: number | null;
  generationsUsed: number;
  maxBulkRows: number;
  createdAt: string;
}

const noopSubscribe = () => () => {};

function useOrigin() {
  return useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
}

function linkStatus(link: LinkRow): { label: string; tone: "success" | "destructive" | "outline" } {
  if (!link.enabled) return { label: "Off", tone: "outline" };
  if (link.expiresAt && new Date(link.expiresAt) <= new Date()) return { label: "Expired", tone: "destructive" };
  if (link.maxGenerations !== null && link.generationsUsed >= link.maxGenerations) return { label: "Limit reached", tone: "destructive" };
  return { label: "Live", tone: "success" };
}

export function LinksManager({ templateId, publishedVersion, links }: { templateId: string; publishedVersion: number; links: LinkRow[] }) {
  const origin = useOrigin();
  const [editing, setEditing] = useState<LinkRow | "new" | null>(null);
  const [qrFor, setQrFor] = useState<LinkRow | null>(null);

  return (
    <div className="mt-6 grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Serving published v{publishedVersion}</p>
        <Button onClick={() => setEditing("new")}>
          <Plus /> New link
        </Button>
      </div>

      {links.length === 0 ? (
        <div className="rounded-lg border border-dashed border-foreground/20 bg-card/60 p-8 text-center">
          <p className="text-lg font-medium">No links yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create one link per audience — e.g. “Guests”, “Committee”, “VIP table” — so you can track and switch them off
            separately.
          </p>
          <Button className="mt-4" onClick={() => setEditing("new")}>
            <Plus /> Create your first link
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3">
          {links.map((link) => (
            <LinkCard key={link.id} link={link} url={`${origin}/i/${link.token}`} onEdit={() => setEditing(link)} onQr={() => setQrFor(link)} />
          ))}
        </ul>
      )}

      <LinkDialog
        templateId={templateId}
        link={editing}
        onClose={() => setEditing(null)}
        onCreated={async (token) => {
          const url = `${window.location.origin}/i/${token}`;
          try {
            await navigator.clipboard.writeText(url);
            toast.success("Link created and copied");
          } catch {
            toast.success("Link created");
          }
        }}
      />
      <QrDialog link={qrFor} url={qrFor ? `${origin}/i/${qrFor.token}` : ""} onClose={() => setQrFor(null)} />
    </div>
  );
}

function LinkCard({ link, url, onEdit, onQr }: { link: LinkRow; url: string; onEdit: () => void; onQr: () => void }) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const status = linkStatus(link);

  return (
    <li className="rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{link.label}</h3>
            <Badge variant={status.tone}>{status.label}</Badge>
          </div>
          <p className="mt-1.5 font-mono text-xs text-muted-foreground">
            {link.generationsUsed}
            {link.maxGenerations !== null ? ` of ${link.maxGenerations}` : ""} invites made
            {link.expiresAt && ` · expires ${new Date(link.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`}
            {link.maxBulkRows > 0 ? ` · bulk up to ${link.maxBulkRows} rows` : " · bulk off"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Switch
            checked={link.enabled}
            disabled={pending}
            aria-label={link.enabled ? "Turn link off" : "Turn link on"}
            onCheckedChange={(enabled) =>
              startTransition(async () => {
                const result = await updateLinkAction(link.id, { enabled });
                if (!result.ok) toast.error(result.error);
              })
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Link actions">
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onQr}>
                <QrCode /> QR code
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink /> Open
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <ConfirmDialog
                title={`Delete “${link.label}”?`}
                description="The link stops working immediately. Its activity stays in your log."
                confirmLabel="Delete link"
                destructive
                onConfirm={async () => {
                  const result = await deleteLinkAction(link.id);
                  if (!result.ok) toast.error(result.error);
                }}
                trigger={
                  <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* A command-line style pill: label · URL · copy. */}
      <div className="mt-4 flex gap-2">
        <div className="flex h-10 min-w-0 flex-1 items-center overflow-hidden rounded-full border border-foreground/15 bg-background font-mono text-xs focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/20">
          <span className="hidden h-full shrink-0 items-center border-r border-foreground/10 px-4 text-muted-foreground sm:flex">url</span>
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Share URL"
            className="h-full min-w-0 flex-1 bg-transparent px-4 outline-none"
          />
          <button
            type="button"
            className="flex h-full shrink-0 items-center gap-1.5 border-l border-foreground/10 px-4 font-sans text-sm font-semibold transition-colors hover:bg-accent"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="size-4 text-brand-ink" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <Button variant="outline" size="icon" className="size-10 shrink-0 rounded-full" aria-label="QR code" onClick={onQr}>
          <QrCode />
        </Button>
      </div>
    </li>
  );
}

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

function LinkDialog({
  templateId,
  link,
  onClose,
  onCreated,
}: {
  templateId: string;
  link: LinkRow | "new" | null;
  onClose: () => void;
  onCreated: (token: string) => void;
}) {
  return (
    <Dialog open={link !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {link !== null && (
          <LinkForm key={link === "new" ? "new" : link.id} templateId={templateId} link={link} onClose={onClose} onCreated={onCreated} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({
  templateId,
  link,
  onClose,
  onCreated,
}: {
  templateId: string;
  link: LinkRow | "new";
  onClose: () => void;
  onCreated: (token: string) => void;
}) {
  const isNew = link === "new";
  const existing = link !== "new" ? link : null;
  const [bulk, setBulk] = useState(existing ? existing.maxBulkRows > 0 : true);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expires = String(form.get("expiresAt") || "");
    const maxGenerations = String(form.get("maxGenerations") || "");
    const maxRows = String(form.get("maxBulkRows") || "200");
    const input = {
      label: String(form.get("label")).trim(),
      // End of the chosen day, local time.
      expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      maxGenerations: maxGenerations ? Number(maxGenerations) : null,
      maxBulkRows: bulk ? Math.max(1, Number(maxRows)) : 0,
    };
    setPending(true);
    const result = existing ? await updateLinkAction(existing.id, input) : await createLinkAction(templateId, input);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (!existing && result.data) onCreated((result.data as { token: string }).token);
    else toast.success("Link updated");
    onClose();
  }

  return (
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{isNew ? "New share link" : "Edit link"}</DialogTitle>
            <DialogDescription>Limits help you control who uses the link and how much.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="l-label">Name</Label>
            <Input id="l-label" name="label" required maxLength={60} defaultValue={existing?.label ?? "Guests"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="l-expires">Expires</Label>
              <Input id="l-expires" name="expiresAt" type="date" defaultValue={toDateInput(existing?.expiresAt ?? null)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="l-max">Max invites</Label>
              <Input id="l-max" name="maxGenerations" type="number" min={1} placeholder="Unlimited" defaultValue={existing?.maxGenerations ?? ""} />
            </div>
          </div>
          <div className="grid gap-3 rounded-lg border bg-background/60 p-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="font-medium">Allow bulk generation</span>
                <span className="block text-muted-foreground">Upload a CSV or Excel file to make many invites at once.</span>
              </span>
              <Switch checked={bulk} onCheckedChange={setBulk} />
            </label>
            {bulk && (
              <div className="grid gap-1.5">
                <Label htmlFor="l-rows">Max rows per batch</Label>
                <Input id="l-rows" name="maxBulkRows" type="number" min={1} max={1000} defaultValue={existing?.maxBulkRows || 200} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {isNew ? "Create link" : "Save"}
            </Button>
          </DialogFooter>
        </form>
  );
}

function QrDialog({ link, url, onClose }: { link: LinkRow | null; url: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!link || !url) return;
    // Cream rather than stark white; still far more contrast than scanners need.
    void QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M", color: { dark: "#231d18", light: "#fcf9f4" } }).then(setDataUrl);
  }, [link, url]);

  return (
    <Dialog open={link !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{link?.label}</DialogTitle>
          <DialogDescription>Print it on posters or table cards — scanning opens the invite form.</DialogDescription>
        </DialogHeader>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
        {dataUrl && <img src={dataUrl} alt="QR code for the link" className="mx-auto w-full max-w-64 rounded-lg border" />}
        <DialogFooter>
          <Button
            onClick={async () => {
              if (!dataUrl) return;
              const blob = await (await fetch(dataUrl)).blob();
              downloadBlob(blob, `${link?.label ?? "invite"}-qr.png`);
            }}
          >
            Download PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
