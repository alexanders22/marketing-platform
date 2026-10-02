import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/landing/LegalPage";
import { LEGAL, operator } from "@/lib/legal";
import { TRIAL_CREDITS, TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Terms of Service — Khma",
  description: "The rules for using Khma: accounts, credits, content, connected platforms and liability.",
};

export default function TermsPage() {
  const mail = <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;
  return (
    <LegalPage title="Terms of Service" updated={LEGAL.updated}>
      <p>
        These terms are an agreement between you and {operator()} (&ldquo;Khma&rdquo;, &ldquo;we&rdquo;) for the use
        of {LEGAL.site}, the Khma apps and the Khma API (the &ldquo;Service&rdquo;). By creating an account or using the
        Service you accept them. If you accept on behalf of a company, you confirm you may bind it.
      </p>

      <h2>1. The Service</h2>
      <p>
        Khma helps you plan, create, publish and measure marketing: AI-written posts and articles, visuals, campaigns,
        bio pages, and — on the accounts you connect — publishing, ads, analytics, forecasts and recommendations.
        Features marked &ldquo;Soon&rdquo; are not yet available. We may change or improve features over time.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must be at least 16 and give a working email address.</li>
        <li>Keep your sign-in details safe; you are responsible for activity in your account.</li>
        <li>Account owners decide who joins their account and what role they have.</li>
        <li>Tell us at once at {mail} if you think your account was used without permission.</li>
      </ul>

      <h2>3. Plans, trial and credits</h2>
      <ul>
        <li>
          New accounts get a {TRIAL_DAYS}-day trial with {TRIAL_CREDITS} credits. No card is needed for the trial.
        </li>
        <li>
          AI actions spend credits at the rates shown in the app before you confirm them (for example one credit per
          post or image). Credits are charged only when the result is delivered.
        </li>
        <li>
          Paid plans and credit packs are billed in advance at the prices shown on our{" "}
          <Link href="/#pricing">pricing</Link> section when you buy. Prices exclude taxes unless stated.
        </li>
        <li>
          Credits already spent are not refundable. If the Service fails to deliver what you paid for, write to us and
          we will restore the credits or refund you. This does not limit any rights you have under consumer law.
        </li>
        <li>
          Ad spend is paid by you directly to the ad platform (for example Meta) under its own terms. Khma never holds
          your ad budget.
        </li>
      </ul>

      <h2>4. Partner accounts</h2>
      <p>
        Some customers use Khma inside a partner product. The partner may create your workspace and show your balance
        and activity in its product. Your account with Khma is still governed by these terms; your relationship with
        the partner is governed by the partner&apos;s terms.
      </p>

      <h2>5. Your content</h2>
      <ul>
        <li>
          You own the content you upload and the content Khma generates for you. You give us a licence to store,
          process and publish it only as needed to run the Service for you.
        </li>
        <li>
          AI output can be wrong, similar to other people&apos;s output or unsuitable. Review everything before you
          publish or spend money on it; you are responsible for what is published from your account.
        </li>
        <li>
          Forecasts of reach, results or costs are estimates based on past data and platform figures, not promises.
        </li>
        <li>
          Do not upload content you have no right to use, or ask the Service to infringe someone else&apos;s rights.
        </li>
      </ul>

      <h2>6. Connected platforms</h2>
      <p>
        When you connect Facebook, Instagram or another network, you authorise Khma to act on that account within the
        permissions you grant. You must follow that platform&apos;s terms and advertising policies. You can disconnect
        at any time in Khma or in the platform&apos;s own settings. We are not responsible for the platforms
        themselves, their outages, rejections or policy decisions.
      </p>

      <h2>7. Acceptable use</h2>
      <p>You may not use the Service to:</p>
      <ul>
        <li>break the law or a platform&apos;s rules, or advertise illegal products or services;</li>
        <li>spam, mislead people, impersonate others or run deceptive or discriminatory ads;</li>
        <li>publish hateful, violent, sexual content involving minors, or content that harasses people;</li>
        <li>collect people&apos;s data without a legal basis;</li>
        <li>attack, overload, scrape or reverse-engineer the Service, or get around credit limits.</li>
      </ul>
      <p>We may remove content or suspend accounts that break these rules, and will tell you why when we can.</p>

      <h2>8. API</h2>
      <p>
        API keys are confidential. Partners are responsible for requests made with their keys and for the workspaces
        they create, and must have their own users&apos; consent to share data with Khma.
      </p>

      <h2>9. Availability</h2>
      <p>
        We work to keep the Service available and your data safe, but provide it &ldquo;as is&rdquo;. Planned
        maintenance and occasional outages may happen. Export anything you cannot afford to lose.
      </p>

      <h2>10. Liability</h2>
      <p>
        To the extent the law allows, we are not liable for indirect or consequential losses, lost profits, ad spend
        or results that differ from a forecast. Our total liability for any claim is limited to what you paid us in
        the 12 months before it. Nothing in these terms limits liability that cannot be limited by law.
      </p>

      <h2>11. Ending the agreement</h2>
      <p>
        You can stop using the Service and ask us to delete your account at any time — see{" "}
        <Link href="/data-deletion">data deletion</Link>. We may end or suspend the Service for serious or repeated
        breaches of these terms. What happens to your data is described in our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may update these terms. We will change the date above and, for significant changes, email account owners at
        least 14 days before they apply. Continuing to use the Service after that means you accept the new terms.
      </p>

      <h2>13. Law</h2>
      <p>
        These terms are governed by the laws of {LEGAL.country}. Disputes go to the courts of {LEGAL.country}, unless
        consumer law gives you the right to go to court where you live.
      </p>

      <h2>14. Contact</h2>
      <p>
        {operator()}. Email: {mail}.
      </p>
    </LegalPage>
  );
}
