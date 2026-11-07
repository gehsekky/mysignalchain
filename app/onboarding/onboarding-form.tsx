"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitOnboarding } from "./actions";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} role="alert" className="text-destructive text-sm">
      {messages[0]}
    </p>
  );
}

export function OnboardingForm() {
  const [state, action, pending] = useActionState(submitOnboarding, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="handle">Handle</Label>
        <Input
          id="handle"
          name="handle"
          required
          autoComplete="off"
          aria-describedby="handle-error"
        />
        <FieldError id="handle-error" messages={errors.handle} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Date of birth</legend>
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="birthMonth">Month</Label>
            <select
              id="birthMonth"
              name="birthMonth"
              required
              defaultValue=""
              className="border-input bg-background h-8 rounded-lg border px-2 text-sm"
            >
              <option value="" disabled>
                Choose
              </option>
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="birthYear">Year</Label>
            <Input
              id="birthYear"
              name="birthYear"
              inputMode="numeric"
              required
              autoComplete="off"
            />
          </div>
        </div>
        <FieldError
          id="birth-error"
          messages={errors.birthMonth ?? errors.birthYear}
        />
        <p className="text-muted-foreground text-sm">
          We use this only to check you&apos;re old enough, and we don&apos;t
          store it.
        </p>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Finish"}
      </Button>
    </form>
  );
}
