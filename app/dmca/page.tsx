import type { Metadata } from "next";
import { CONTACT_EMAIL, DMCA_AGENT } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Copyright complaints · mysignalchain",
};

export default function DmcaPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-12 text-sm leading-6 [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5">
      <h1 className="text-2xl font-semibold tracking-tight">
        Copyright complaints
      </h1>

      <p className="mt-6">
        If you believe content on mysignalchain infringes your copyright, send a
        notice to the designated agent below. It should include:
      </p>
      <ol>
        <li>The work you believe is infringed.</li>
        <li>
          The link to each page or photo on mysignalchain you want removed.
        </li>
        <li>Your name, address, phone number and email address.</li>
        <li>
          A statement that you believe in good faith the use isn&apos;t
          authorized by the copyright owner, its agent or the law.
        </li>
        <li>
          A statement, under penalty of perjury, that the notice is accurate and
          that you are the owner or authorized to act for the owner.
        </li>
        <li>Your physical or electronic signature.</li>
      </ol>
      <p className="mt-2">
        Reported content is hidden promptly and its uploader is told. The
        uploader can send a counter-notice if they believe it was removed by
        mistake. Accounts that repeatedly post infringing content are closed.
      </p>

      <h2>Designated agent</h2>
      {DMCA_AGENT ? (
        <address className="not-italic">
          {DMCA_AGENT.name}
          {DMCA_AGENT.address.map((line) => (
            <span key={line}>
              <br />
              {line}
            </span>
          ))}
          <br />
          <a href={`mailto:${DMCA_AGENT.email}`}>{DMCA_AGENT.email}</a>
          <br />
          <span className="text-muted-foreground">
            U.S. Copyright Office registration {DMCA_AGENT.registration}
          </span>
        </address>
      ) : (
        <p>
          Registration with the U.S. Copyright Office is in progress. Until it
          appears here, send notices to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      )}
    </article>
  );
}
