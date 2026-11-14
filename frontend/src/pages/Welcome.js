// Public front page (no login): what it does, prices, start free.
import { Link } from "react-router-dom";
import { Camera, Check, ClipboardCheck, Contact, FileDown, QrCode, ShieldCheck, Users } from "lucide-react";
import { PLAN_PRICES, FREE_TOOL_LIMIT } from "@/components/BillingCard";
import toolTrackerLogo from "@/assets/tool-tracker-logo.png";

const gold = "bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)]";

const FEATURES = [
  { icon: Camera, title: "Photo record of every tool", text: "Make, model, serial number, photo, what you paid. If you get broken into, the list for police and insurance is already done." },
  { icon: Contact, title: "Lend it, know who's got it", text: "Check a tool out to a mate, a subbie or your crew. Name and phone is all you need - they don't need a login." },
  { icon: QrCode, title: "QR labels", text: "Print a label, stick it on, scan it with your phone to check it out or back in." },
  { icon: ShieldCheck, title: "Test and tag reminders", text: "Keep tag dates, certificates and servicing in one spot, with a heads-up before they run out." },
  { icon: Users, title: "Crew and handovers", text: "Hand tools from one person to the next on site, with job number and site manager on the record." },
  { icon: FileDown, title: "Reports and exports", text: "See what's out, what's overdue and what gets used most. Export to CSV or PDF any time - it's your data." },
];

function Plan({ name, price, sub, points, highlight, cta = "Start free" }) {
  return (
    <div className={`flex flex-col border-2 bg-white p-6 ${highlight ? "border-[hsl(38,92%,50%)] shadow-[0_12px_40px_rgba(245,158,11,0.18)]" : "border-slate-200"}`}>
      <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">{name}</p>
      <p className="mt-2 font-['Barlow_Condensed'] text-4xl font-black">{price}</p>
      <p className="text-sm text-slate-500">{sub}</p>
      <ul className="mt-4 flex-1 space-y-2 text-sm">
        {points.map((p) => (
          <li key={p} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-600" />{p}</li>
        ))}
      </ul>
      <Link to="/setup" className={`mt-6 block py-3 text-center text-xs font-black uppercase tracking-wider ${highlight ? gold : "border-2 border-slate-900 hover:bg-slate-900 hover:text-white"}`}>
        {cta}
      </Link>
    </div>
  );
}

export default function Welcome() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" data-testid="welcome-page">
      <header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link to="/welcome" className="flex items-center gap-2">
            <img src={toolTrackerLogo} alt="" className="h-8 w-8 object-contain" />
            <span className="whitespace-nowrap font-['Barlow_Condensed'] text-lg font-black uppercase tracking-wide sm:text-xl">Long Line<span className="hidden sm:inline"> Tool Tracker</span></span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <a href="#pricing" className="hidden hover:underline sm:inline">Pricing</a>
            <Link to="/login" className="hover:underline">Sign in</Link>
            <Link to="/setup" className={`px-4 py-2 text-xs font-black uppercase tracking-wider ${gold}`}>Start free</Link>
          </nav>
        </div>
      </header>

      <section className="bg-slate-950 text-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-[hsl(38,92%,55%)]">Built by a Kiwi project manager, for tradies</p>
          <h1 className="mt-3 max-w-3xl font-['Barlow_Condensed'] text-5xl font-black uppercase leading-[0.95] sm:text-7xl">
            Know where every tool is.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-300">
            Photo-record your gear, lend it out and get it back, and keep tags and certs up to date. Works on your phone,
            no app to install.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/setup" className={`px-6 py-3 text-sm font-black uppercase tracking-wider ${gold}`} data-testid="welcome-start">Start free - 14 days unlimited</Link>
            <a href="#pricing" className="border-2 border-white/40 px-6 py-3 text-sm font-black uppercase tracking-wider hover:border-white">See prices</a>
          </div>
          <p className="mt-3 text-sm text-slate-400">No card needed. Free for up to {FREE_TOOL_LIMIT} tools after the trial.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="font-['Barlow_Condensed'] text-3xl font-black uppercase">What it does</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="border-2 border-slate-200 bg-white p-5">
              <Icon size={26} className="text-[hsl(38,92%,45%)]" />
              <p className="mt-3 font-bold">{title}</p>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="border-y bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="font-['Barlow_Condensed'] text-3xl font-black uppercase">Pricing</h2>
          <p className="mt-1 text-slate-600">NZ dollars. Cancel any time - your records stay.</p>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            <Plan
              name="Free"
              price="$0"
              sub="For your own gear"
              points={[`Up to ${FREE_TOOL_LIMIT} tools`, "Photos and serial numbers", "Lend to anyone by name", "QR labels", "Tag and cert reminders", "Export any time"]}
            />
            <Plan
              name="Personal Plus"
              price={PLAN_PRICES.personal_plus_month.replace(" / month", "")}
              sub={`per month, or ${PLAN_PRICES.personal_plus_year.replace(" / ", " a ")}`}
              points={["Unlimited tools", "Everything in Free", "Good for a full van or workshop"]}
            />
            <Plan
              name="Crew"
              price={PLAN_PRICES.crew_month.replace(" / month incl. 5 users", "")}
              sub={`per month for the company, 5 users included. Extra users ${PLAN_PRICES.crew_extra_seat.replace(" / month per extra user", "")} each.`}
              points={["Logins for your crew", "Handovers between people and sites", "Job numbers and site managers", "Reports, overdue and usage", "Admin, site manager and worker roles"]}
              highlight
            />
          </div>
          <p className="mt-4 text-sm text-slate-500">Every new account starts with 14 days of everything, free. Upgrade from Settings when you're ready.</p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-16">
        <h2 className="font-['Barlow_Condensed'] text-3xl font-black uppercase">Common questions</h2>
        <div className="mt-6 space-y-5">
          {[
            ["Do the people I lend to need an account?", "No. Just their name, and a phone number if you want it."],
            ["What happens when the trial ends?", `Nothing is deleted. You go to the free plan (up to ${FREE_TOOL_LIMIT} tools) unless you choose a paid one.`],
            ["Can I get my data out?", "Yes, any time - CSV or PDF, from Reports."],
            ["Where is my data kept?", "In a secure database in Sydney, Australia. Each account is kept separate, and photos are private to your team."],
            ["Does it work on my phone?", "Yes. It runs in your phone's browser - you can add it to your home screen like an app."],
          ].map(([q, a]) => (
            <div key={q}>
              <p className="flex items-center gap-2 font-bold"><ClipboardCheck size={16} className="text-[hsl(38,92%,45%)]" />{q}</p>
              <p className="mt-1 text-slate-600">{a}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link to="/setup" className={`inline-block px-8 py-3 text-sm font-black uppercase tracking-wider ${gold}`}>Start free</Link>
        </div>
      </section>

      <footer className="border-t bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-slate-500">
          <p>© {new Date().getFullYear()} Long Line</p>
          <nav className="flex gap-4">
            <Link to="/terms" className="hover:underline">Terms</Link>
            <Link to="/privacy" className="hover:underline">Privacy</Link>
            <Link to="/login" className="hover:underline">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
