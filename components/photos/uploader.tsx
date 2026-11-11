"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  finishUploadAction,
  startUploadAction,
  type UploadRequest,
} from "@/app/photos/actions";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Sends a photo straight to storage with a one-off form from the server,
 * then asks the server to process it. See lib/images.
 */
export function PhotoUploader({
  request,
  offerOption = false,
  ccFields = false,
  label = "Add a photo",
}: {
  /** Omit to ask for the gear item (admins adding gear page photos). */
  request?: UploadRequest;
  offerOption?: boolean;
  ccFields?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string }>();

  async function upload(formData: FormData) {
    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      return setMessage({ error: true, text: "Choose a photo first." });
    }
    if (!ACCEPTED.includes(file.type)) {
      return setMessage({
        error: true,
        text: "Upload a JPEG, PNG or WebP photo.",
      });
    }
    if (file.size > MAX_BYTES) {
      return setMessage({ error: true, text: "Photos can be up to 15 MB." });
    }
    setBusy(true);
    setMessage({ error: false, text: "Uploading…" });
    try {
      const start = await startUploadAction(
        request ?? {
          kind: "gear",
          reference: String(formData.get("reference") ?? ""),
        },
      );
      if (!start.ok) return setMessage({ error: true, text: start.message });

      const body = new FormData();
      for (const [name, value] of Object.entries(start.ticket.upload.fields)) {
        body.append(name, value);
      }
      body.append("Content-Type", file.type);
      body.append("file", file);
      const posted = await fetch(start.ticket.upload.url, {
        method: "POST",
        body,
      });
      if (!posted.ok) {
        return setMessage({
          error: true,
          text: "The upload failed. Try again.",
        });
      }

      setMessage({ error: false, text: "Processing…" });
      const done = await finishUploadAction({
        ticket: start.ticket,
        target: start.target,
        offered: formData.get("offered") === "on",
        cc: ccFields
          ? {
              attribution: String(formData.get("attribution") ?? ""),
              license: String(formData.get("license") ?? ""),
              sourceUrl: String(formData.get("sourceUrl") ?? ""),
            }
          : undefined,
      });
      if (!done.ok) return setMessage({ error: true, text: done.message });
      form.current?.reset();
      setMessage({ error: false, text: "Uploaded." });
      router.refresh();
    } catch {
      setMessage({ error: true, text: "The upload failed. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={form} action={upload} className="flex flex-col gap-3 text-sm">
      <label className="flex flex-col gap-2">
        <span className="font-medium">{label}</span>
        <input
          type="file"
          name="photo"
          accept={ACCEPTED.join(",")}
          className="text-sm"
        />
        <span className="text-muted-foreground">
          JPEG, PNG or WebP, up to 15 MB. Location and camera details are
          removed. An admin checks each photo before anyone else can see it.
        </span>
      </label>
      {!request && (
        <input
          name="reference"
          placeholder="Gear item, e.g. boss/sd-1"
          aria-label="Gear item"
          className="border-input h-8 rounded-lg border px-2"
        />
      )}
      {ccFields && (
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            name="attribution"
            placeholder="Author"
            aria-label="Author"
            className="border-input h-8 rounded-lg border px-2"
          />
          <input
            name="license"
            placeholder="License, e.g. CC BY-SA 4.0"
            aria-label="License"
            className="border-input h-8 rounded-lg border px-2"
          />
          <input
            name="sourceUrl"
            type="url"
            placeholder="https://commons.wikimedia.org/…"
            aria-label="Link to the original"
            className="border-input h-8 rounded-lg border px-2"
          />
        </div>
      )}
      {offerOption && (
        <label className="flex items-start gap-2">
          <input type="checkbox" name="offered" className="mt-0.5" />
          <span>
            Offer this photo for the catalog page of this gear
            <span className="text-muted-foreground block">
              If an admin uses it there, anyone can see it, credited to your
              handle, even if this item is private.
            </span>
          </span>
        </label>
      )}
      <Button type="submit" size="sm" disabled={busy} className="self-start">
        {busy ? "Uploading…" : "Upload"}
      </Button>
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={
            message.error ? "text-destructive" : "text-muted-foreground"
          }
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
