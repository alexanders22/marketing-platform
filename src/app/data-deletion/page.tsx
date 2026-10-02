import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/landing/LegalPage";
import { LEGAL } from "@/lib/legal";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Data deletion — Khma",
  description: "How to delete your Khma data, including data received from Facebook and Instagram.",
};

export default async function DataDeletionPage({ searchParams }: PageProps<"/data-deletion">) {
  const raw = (await searchParams).code;
  const code = typeof raw === "string" ? raw.slice(0, 64) : null;
  const request = code ? await prisma.metaDeletion.findUnique({ where: { code } }) : null;
  const mail = <a href={`mailto:${LEGAL.email}?subject=Delete%20my%20Khma%20data`}>{LEGAL.email}</a>;
  return (
    <LegalPage title="Data deletion" updated={LEGAL.updated}>
      {code && (
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
          <p className="text-sm text-zinc-400">Request {code}</p>
          <p className="mt-1 font-semibold text-white">
            {!request
              ? "We could not find this request. Check the code or write to us."
              : request.completedAt
                ? `Completed on ${request.completedAt.toISOString().slice(0, 10)} — all data received from Facebook and Instagram for this person has been deleted.`
                : "Received — deletion is in progress and finishes within 30 days."}
          </p>
        </div>
      )}
      <p>You can remove the data Khma holds about you at any time. There are three ways.</p>

      <h2>1. Disconnect a social account</h2>
      <p>
        In Khma, open <strong>Channels</strong> and disconnect the Facebook Page, Instagram account or other profile.
        Its access token is deleted immediately, and posts, insights, ad results and messages we received from it are
        deleted within 30 days.
      </p>

      <h2>2. Remove Khma from Facebook</h2>
      <p>
        On Facebook, go to <strong>Settings &amp; privacy → Settings → Business integrations</strong> (or{" "}
        <strong>Apps and websites</strong>), find Khma and select <strong>Remove</strong>. Facebook tells us about the
        removal and we delete all data received from your Facebook and Instagram accounts within 30 days. If you also
        tick the option to delete data, you receive a confirmation code you can use to check the status with us.
      </p>

      <h2>3. Delete your whole account</h2>
      <p>
        Email {mail} from the address you use to sign in and ask us to delete your account. We confirm by email and
        delete your account, workspaces, content, media and connected accounts within 30 days. Records we must keep by
        law, such as payment records, are kept only as long as the law requires.
      </p>

      <p>
        More about what we collect and why is in our <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}
