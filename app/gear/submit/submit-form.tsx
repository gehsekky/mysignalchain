"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TEMPLATES } from "@/lib/catalog/templates";
import { submitGearAction, type SubmitFormState } from "./actions";

type Categories = {
  name: string;
  children: { slug: string; name: string }[];
}[];

const selectClass =
  "border-input bg-background h-8 w-full rounded-lg border px-2 text-sm";
const textareaClass =
  "border-input bg-background min-h-16 w-full rounded-lg border px-2.5 py-1.5 text-sm";

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} role="alert" className="text-destructive text-sm">
      {messages[0]}
    </p>
  );
}

function Field({
  name,
  label,
  hint,
  errors,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  errors: SubmitFormState["fieldErrors"];
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
      <FieldError id={`${name}-error`} messages={errors?.[name]} />
    </div>
  );
}

export function SubmitForm({ categories }: { categories: Categories }) {
  const [state, action, pending] = useActionState(submitGearAction, {});
  const errors = state.fieldErrors;

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.existing && (
        <p role="alert" className="bg-muted rounded-lg px-4 py-3 text-sm">
          That&apos;s already in the catalog:{" "}
          <Link
            href={state.existing.href}
            className="underline underline-offset-4"
          >
            see its page
          </Link>
          .
        </p>
      )}
      {state.formError && (
        <p role="alert" className="text-destructive text-sm">
          {state.formError}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="brandName" label="Brand" errors={errors}>
          <Input id="brandName" name="brandName" required maxLength={60} />
        </Field>
        <Field name="modelName" label="Model" errors={errors}>
          <Input id="modelName" name="modelName" required maxLength={80} />
        </Field>
        <Field name="categorySlug" label="Category" errors={errors}>
          <select
            id="categorySlug"
            name="categorySlug"
            required
            defaultValue=""
            className={selectClass}
          >
            <option value="" disabled>
              Choose
            </option>
            {categories.map((top) => (
              <optgroup key={top.name} label={top.name}>
                {top.children.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field name="years" label="Years made (optional)" errors={errors}>
          <Input
            id="years"
            name="years"
            placeholder="e.g. 1995–present"
            maxLength={40}
          />
        </Field>
      </div>

      <Field
        name="template"
        label="Kind of gear"
        hint="This sets its jacks. Amps in the Combos category also get a built-in speaker."
        errors={errors}
      >
        <select
          id="template"
          name="template"
          required
          defaultValue=""
          className={selectClass}
        >
          <option value="" disabled>
            Choose
          </option>
          {Object.entries(TEMPLATES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">
          DC power (leave blank if it doesn&apos;t take a DC adaptor)
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="volts" label="Volts" errors={errors}>
            <Input
              id="volts"
              name="volts"
              inputMode="decimal"
              placeholder="9"
            />
          </Field>
          <Field name="ma" label="Current draw (mA)" errors={errors}>
            <Input
              id="ma"
              name="ma"
              inputMode="decimal"
              placeholder="Optional"
            />
          </Field>
          <Field name="polarity" label="Polarity" errors={errors}>
            <select
              id="polarity"
              name="polarity"
              defaultValue=""
              className={selectClass}
            >
              <option value="">Not sure</option>
              <option value="center_negative">Center negative</option>
              <option value="center_positive">Center positive</option>
            </select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Other jacks</legend>
        {(
          [
            ["expression", "Expression pedal input"],
            ["tap", "Tap tempo or footswitch input"],
            ["midiIn", "MIDI in"],
            ["midiOut", "MIDI out"],
          ] as const
        ).map(([name, label]) => (
          <label key={name} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={name} className="size-4" />
            {label}
          </label>
        ))}
      </fieldset>

      <Field
        name="finishes"
        label="Finishes (optional)"
        hint="Colors it comes in, one per line."
        errors={errors}
      >
        <textarea
          id="finishes"
          name="finishes"
          className={textareaClass}
          maxLength={1000}
        />
      </Field>
      <Field
        name="aliases"
        label="Other names (optional)"
        hint="Nicknames or model numbers people search for, one per line."
        errors={errors}
      >
        <textarea
          id="aliases"
          name="aliases"
          className={textareaClass}
          maxLength={1000}
        />
      </Field>
      <Field
        name="sourceUrl"
        label="Maker's page (optional)"
        hint="A link to the manufacturer's page with its specs helps us check it."
        errors={errors}
      >
        <Input id="sourceUrl" name="sourceUrl" type="url" maxLength={500} />
      </Field>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Submitting…" : "Submit for review"}
      </Button>
    </form>
  );
}
