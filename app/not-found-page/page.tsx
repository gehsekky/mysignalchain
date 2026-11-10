import { notFound } from "next/navigation";

// This page only ever 404s, so there is no shell to validate.
export const instant = false;

/** proxy.ts rewrites hidden or missing pages here, so they get a real 404. */
export default function NotFoundPage() {
  notFound();
}
