// Terms of Use and Privacy Policy (public pages, no login).
// DRAFT until Davy approves: fill in LEGAL below, set DRAFT = false, and bump TERMS_VERSION whenever the wording changes.
import { Link } from "react-router-dom";
import { PLAN_PRICES, FREE_TOOL_LIMIT } from "@/components/BillingCard";

export const TERMS_VERSION = "2026-11-draft";
const DRAFT = true;

const LEGAL = {
  product: "Long Line Tool Tracker",
  business: "Long Line",
  operator: "David Christopher Long, a sole trader",
  contactEmail: "support@longline.co.nz",
  updated: "10 November 2026",
};

function Page({ title, children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/welcome" className="font-['Barlow_Condensed'] text-xl font-black uppercase tracking-wide">Long Line Tool Tracker</Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/terms" className="hover:underline">Terms</Link>
            <Link to="/privacy" className="hover:underline">Privacy</Link>
            <Link to="/login" className="hover:underline">Sign in</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8">
        {DRAFT && (
          <p className="mb-6 border-2 border-amber-500 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            Draft - not yet final. Wording to be approved before launch.
          </p>
        )}
        <h1 className="font-['Barlow_Condensed'] text-4xl font-black uppercase">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">Last updated {LEGAL.updated}</p>
        <div className="legal mt-6 space-y-4 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </div>
      </main>
    </div>
  );
}

export function Terms() {
  return (
    <Page title="Terms of Use">
      <p>
        These terms cover your use of {LEGAL.product} (the "service"), run by {LEGAL.operator} trading as {LEGAL.business}
        ("we", "us"). By creating an account you agree to them. If you sign up for a business, you confirm you can agree for it.
      </p>

      <h2>1. The service</h2>
      <p>
        The service lets you keep a record of your tools, who has them, photos, certificates and servicing. You can use it on
        the free plan or a paid plan. We may improve or change features over time, and we'll tell you before any change that
        takes away something you pay for.
      </p>

      <h2>2. Plans, trial and payment</h2>
      <li>New accounts get a 14-day trial with unlimited tools.</li>
      <li>After the trial, personal accounts drop to the free plan (up to {FREE_TOOL_LIMIT} tools) unless you upgrade. Nothing is deleted.</li>
      <li>Paid plans: Personal Plus {PLAN_PRICES.personal_plus_month} or {PLAN_PRICES.personal_plus_year}; Crew {PLAN_PRICES.crew_month}, plus {PLAN_PRICES.crew_extra_seat}. Prices are in NZ dollars and include GST.</li>
      <li>Paid plans renew automatically each month or year until you cancel. Card payments are handled by Stripe; we never see or store your full card number.</li>
      <li>You can cancel any time in Settings, under Plan &amp; billing. Your plan stays active until the end of the period you've paid for. We don't give part refunds for unused time, except where the law requires it.</li>
      <li>We'll give you at least 30 days' notice of any price change, by email or in the app.</li>
      <li>If a Crew plan ends and isn't renewed, you can still see and export your records, but can't add or change them until a plan is chosen.</li>

      <h2>3. Your account</h2>
      <li>Keep your password private. You're responsible for what happens under your logins, including people you invite.</li>
      <li>Admins choose who's in their team and what they can do, and can remove them at any time.</li>
      <li>Tell us straight away if you think someone has got into your account.</li>

      <h2>4. Your data</h2>
      <p>
        Everything you put in (tools, people, photos, documents, history) stays yours. You give us permission to store and
        process it only to run the service for you. You can export it at any time. How we look after personal information is
        set out in our <Link to="/privacy" className="underline">Privacy Policy</Link>.
      </p>
      <p>
        If you add other people's details (for example a borrower's name and phone number), you're responsible for having a
        good reason to record them and for letting them know their details are recorded, why, and who to contact about
        them (Privacy Act 2020, IPP 3A). We hold those details on your behalf.
      </p>

      <h2>5. Fair use</h2>
      <p>Don't use the service to break the law, to store things you have no right to store, to try to get into other accounts, or in a way that harms the service or other users. We can suspend accounts that do.</p>

      <h2>6. Records are a tool, not a guarantee</h2>
      <p>
        The service helps you keep track of tools, tags and certificates, but it doesn't check them for you. You're still
        responsible for tool safety, inspections, test and tag, and meeting your health and safety duties. Reminders depend on
        the dates you enter and may not arrive (for example if an email is blocked).
      </p>

      <h2>7. Availability and liability</h2>
      <p>
        We work to keep the service running and your data backed up, but we can't promise it will never be unavailable or
        error-free. If you're using the service for a business, you agree the Consumer Guarantees Act 1993 doesn't apply, as
        allowed by section 43 of that Act. Nothing in these terms limits rights you have that can't legally be excluded.
      </p>
      <p>
        To the extent the law allows, we aren't liable for indirect losses (such as lost profit or lost tools), and our total
        liability to you is limited to the amount you paid us in the 12 months before the claim.
      </p>

      <h2>8. Closing your account</h2>
      <p>
        You can stop using the service and ask us to close your account at any time. We'll give you the chance to export your
        data first. We can close accounts that break these terms, or end the service with at least 60 days' notice and a
        chance to export.
      </p>

      <h2>9. Changes and law</h2>
      <p>
        We may update these terms. If a change matters, we'll tell you before it takes effect. These terms are governed by New
        Zealand law, and New Zealand courts have jurisdiction.
      </p>

      <h2>Contact</h2>
      <p>{LEGAL.contactEmail}</p>
    </Page>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy Policy">
      <p>
        This policy explains how {LEGAL.business} ({LEGAL.operator}) collects, uses and protects personal information in{" "}
        {LEGAL.product}, in line with the New Zealand Privacy Act 2020.
      </p>

      <h2>What we collect</h2>
      <li><b>Account details:</b> your name, email, company name and password (stored securely by our login provider; we never see it).</li>
      <li><b>Team and borrowers:</b> names, emails and phone numbers of people you add.</li>
      <li><b>What you enter:</b> tools, photos, certificates, check-outs, job numbers, sites and notes.</li>
      <li><b>Billing:</b> your plan and payment status. Card details go straight to Stripe and are never stored by us.</li>
      <li><b>Technical:</b> basic logs (such as sign-in times and errors) needed to keep the service secure and working.</li>

      <h2>Why we use it</h2>
      <p>
        Only to run the service for you: logging you in, storing your records, sending reminders and account emails, taking
        payment, keeping things secure and fixing problems. We don't sell personal information, and we don't use it for
        advertising. We only send marketing emails if you've agreed to them, and every one has an unsubscribe link.
      </p>

      <h2>Who we share it with</h2>
      <p>We use a few trusted providers to run the service. They only get what they need to do their job:</p>
      <li>Supabase - database, logins and file storage (data held in Sydney, Australia).</li>
      <li>Stripe - card payments and invoices.</li>
      <li>Our website host and email sending provider.</li>
      <p>
        Some of these providers are overseas (mainly Australia and the United States). We choose providers with protections
        comparable to New Zealand's privacy law. We'll only share information with others if you ask us to or the law requires it.
      </p>

      <h2>Who can see your records</h2>
      <p>
        Each account's records are kept separate. Only people in your team can see them, and admins control who's in the team.
        Photos and documents are private and can only be opened by your team.
      </p>

      <h2>How long we keep it</h2>
      <p>
        While your account is open. If you close it, we delete your records within 90 days, apart from billing records we must
        keep by law (usually 7 years for tax). Backups roll over and are cleared on their normal cycle.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted when it travels and when it's stored, access is limited by account, and we keep backups. If a privacy
        breach could cause serious harm, we'll tell you and the Office of the Privacy Commissioner as the law requires.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to see or correct the personal information we hold about you, and you can export your records at any time
        from the app. If you're a borrower or team member added by someone else, you can also contact us. To make a request, email{" "}
        {LEGAL.contactEmail}. If you're not happy with how we handle it, you can complain to the Office of the Privacy
        Commissioner (privacy.org.nz).
      </p>

      <h2>Changes</h2>
      <p>We'll update this page if anything changes and tell you about any important change.</p>
    </Page>
  );
}
