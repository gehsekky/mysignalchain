/** Shared by the privacy, terms and DMCA pages. */
export const CONTACT_EMAIL = "gehsekky@gmail.com";

/**
 * The DMCA designated agent, as registered with the U.S. Copyright Office.
 * Null until the registration is done, just before the beta. While it's null,
 * member photo uploads stay off in production even if the UPLOADS flag in
 * deploy/host/deploy.sh is "on".
 */
export const DMCA_AGENT: {
  name: string;
  address: string[];
  email: string;
  registration: string;
} | null = null;
