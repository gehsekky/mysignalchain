/** Shared by the privacy, terms and DMCA pages. */
export const CONTACT_EMAIL = "gehsekky@gmail.com";

/**
 * The DMCA designated agent, as registered with the U.S. Copyright Office.
 * Null until the registration is done; member photo uploads stay off in
 * production until then (UPLOADS in deploy/host/deploy.sh).
 */
export const DMCA_AGENT: {
  name: string;
  address: string[];
  email: string;
  registration: string;
} | null = null;
