import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/landing/LegalPage";
import { LEGAL, operator } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — Loudpilot",
  description: "What data Loudpilot collects, why, who processes it and how to delete it.",
};

export default function PrivacyPage() {
  const mail = <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;
  return (
    <LegalPage title="Privacy Policy" updated={LEGAL.updated}>
      <p>
        This policy explains what personal data {operator()} (&ldquo;Loudpilot&rdquo;, &ldquo;we&rdquo;) collects when you
        use {LEGAL.site} and the Loudpilot apps and API, why we collect it, who we share it with and what you can do about
        it. Questions: {mail}.
      </p>

      <h2>1. Data we collect</h2>
      <h3>Account data</h3>
      <ul>
        <li>Your name and email address, and whether the email is verified.</li>
        <li>A one-way hash of your password, if you set one. We never store the password itself.</li>
        <li>Your Google account id and email, if you sign in with Google.</li>
        <li>
          A login session: a random token kept in a cookie; we store only its hash. Sign-in links sent by email are
          stored the same way and expire.
        </li>
      </ul>
      <h3>Workspace content</h3>
      <ul>
        <li>
          Your brand kit: website, description, voice, audience, colours, fonts, logo and social links — including what
          we read from the public website you ask us to import.
        </li>
        <li>Posts, campaigns, blog articles, designs, hashtag libraries and bio pages you create.</li>
        <li>Images and files you upload or generate.</li>
        <li>Your credit balance and a log of credit purchases and spending.</li>
      </ul>
      <h3>Connected social accounts</h3>
      <p>
        When you connect a Facebook Page, an Instagram professional account or another network, we receive from that
        platform the account id, name, profile picture and an access token, plus — depending on the permissions you
        grant — the posts we publish for you, their insights (reach, impressions, engagement), your ad accounts,
        campaigns, budgets and results, and messages, comments and leads sent to your pages. Access tokens are stored
        encrypted.
      </p>
      <h3>Bio page visitors</h3>
      <p>
        For public bio pages we count views and which link was clicked. We do not store visitors&apos; IP addresses,
        set cookies on them or use third-party trackers.
      </p>
      <h3>What we do not collect</h3>
      <p>
        We use no advertising or analytics trackers on our site and set no cookies other than the login session
        cookie. We never sell personal data.
      </p>

      <h2>2. Why we use it</h2>
      <ul>
        <li>To run your account and sign you in (performance of our contract with you).</li>
        <li>
          To generate content, plans, forecasts and recommendations you ask for, and to publish, schedule and measure
          posts and ads on the accounts you connect (contract).
        </li>
        <li>To send service email: sign-in links, password resets and alerts you turn on (contract).</li>
        <li>To prevent abuse, such as limiting repeated failed logins (legitimate interest in security).</li>
        <li>To keep records the law requires, such as payment records (legal obligation).</li>
      </ul>
      <p>
        Data received from Meta, Google or other platforms is used only to provide Loudpilot features to the account that
        connected it. It is not used to build profiles of people, not sold, and not used to target ads outside your
        own campaigns.
      </p>

      <h2>3. Who processes data for us</h2>
      <ul>
        <li>
          <strong>Google (Gemini API)</strong> — receives the text, images and brand details needed to generate content
          or recommendations you request.
        </li>
        <li>
          <strong>Google Sign-In</strong> — only if you choose to sign in with Google.
        </li>
        <li>
          <strong>Meta and other social networks</strong> — receive the posts, ads and replies you choose to publish
          through Loudpilot, under their own terms and privacy policies.
        </li>
        <li>
          <strong>Our hosting provider</strong> — runs the servers that store the database and files.
        </li>
      </ul>
      <p>
        If you use Loudpilot through a partner product (for example a CRM that embeds Loudpilot), that partner gave us your
        workspace name and its own reference id, and may see your credit balance and activity in its product. The
        partner&apos;s own privacy policy covers what it does with your data.
      </p>

      <h2>4. How long we keep it</h2>
      <ul>
        <li>Account and workspace data: while your account is open.</li>
        <li>Disconnected social accounts: tokens are deleted at once; data fetched from them within 30 days.</li>
        <li>
          After you delete your account: everything is deleted within 30 days, except records we must keep by law
          (such as payment records).
        </li>
        <li>Sessions expire after 30 days; sign-in links expire within an hour and work only once.</li>
      </ul>

      <h2>5. Your rights</h2>
      <p>
        You can access, correct, export or delete your data, object to or restrict its processing, and withdraw
        consent you gave (for example by disconnecting a social account). Write to {mail} from the email on your
        account. You may also complain to the Personal Data Protection Service of {LEGAL.country} or the authority
        where you live.
      </p>
      <p>
        How to delete your data, including data received from Facebook and Instagram, is described on the{" "}
        <Link href="/data-deletion">data deletion page</Link>.
      </p>

      <h2>6. Security</h2>
      <p>
        Traffic is encrypted with HTTPS. Passwords are hashed, social tokens are encrypted, partner API keys are stored
        only as hashes, and media files are served only to members of the workspace that owns them (or publicly, if you
        publish them on a bio page).
      </p>

      <h2>7. International transfers</h2>
      <p>
        Google and Meta may process data outside {LEGAL.country}. They do so under their own data-transfer safeguards.
      </p>

      <h2>8. Children</h2>
      <p>Loudpilot is a business tool and is not meant for anyone under 16.</p>

      <h2>9. Changes</h2>
      <p>
        We will update this page when our practices change and change the date above. For significant changes we
        will also email account owners.
      </p>

      <h2>10. Contact</h2>
      <p>
        {operator()}. Email: {mail}.
      </p>
    </LegalPage>
  );
}
