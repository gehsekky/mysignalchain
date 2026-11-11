"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UnitFormState } from "./actions";

const selectClass =
  "border-input bg-background h-8 w-full rounded-lg border px-2 text-sm";
const textareaClass =
  "border-input bg-background min-h-20 w-full rounded-lg border px-2.5 py-1.5 text-sm";

export type UnitDefaults = {
  status: "owned" | "wishlist" | "sold";
  finish: string;
  customFinish: string;
  nickname: string;
  mods: string;
  notes: string;
  public: boolean;
};

function Errors({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {messages[0]}
    </p>
  );
}

export function UnitForm({
  action,
  hidden,
  finishes,
  defaults,
  submitLabel,
}: {
  action: (state: UnitFormState, formData: FormData) => Promise<UnitFormState>;
  hidden: Record<string, string>;
  finishes: { id: string; name: string }[];
  defaults: UnitDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [finish, setFinish] = useState(defaults.finish);
  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {state.formError && (
        <p role="alert" className="text-destructive text-sm">
          {state.formError}
        </p>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Status</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {(
            [
              ["owned", "I own it"],
              ["wishlist", "Wishlist"],
              ["sold", "Sold it"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="status"
                value={value}
                defaultChecked={defaults.status === value}
              />
              {label}
            </label>
          ))}
        </div>
        <Errors messages={errors?.status} />
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="finish">Finish</Label>
        <select
          id="finish"
          name="finish"
          className={selectClass}
          value={finish}
          onChange={(e) => setFinish(e.target.value)}
        >
          <option value="">Not specified</option>
          {finishes.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
          <option value="other">Other…</option>
        </select>
        <Errors messages={errors?.finish} />
      </div>
      {finish === "other" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="customFinish">Describe the finish</Label>
          <Input
            id="customFinish"
            name="customFinish"
            maxLength={80}
            defaultValue={defaults.customFinish}
          />
          <Errors messages={errors?.customFinish} />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="nickname">Nickname (optional)</Label>
        <Input
          id="nickname"
          name="nickname"
          maxLength={60}
          defaultValue={defaults.nickname}
        />
        <Errors messages={errors?.nickname} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="mods">Mods (optional)</Label>
        <textarea
          id="mods"
          name="mods"
          maxLength={1000}
          className={textareaClass}
          defaultValue={defaults.mods}
        />
        <Errors messages={errors?.mods} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <textarea
          id="notes"
          name="notes"
          maxLength={2000}
          className={textareaClass}
          defaultValue={defaults.notes}
        />
        <Errors messages={errors?.notes} />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="public"
          defaultChecked={defaults.public}
          className="mt-0.5"
        />
        <span>
          Show on my public profile
          <span className="text-muted-foreground block">
            Off by default: only you see this item. When it&apos;s on, anyone
            can see it, with its nickname, mods, notes and approved photos.
          </span>
        </span>
      </label>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
