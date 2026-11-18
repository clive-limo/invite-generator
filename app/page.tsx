import { ArrowRight, FileArchive, FileDown, FileSpreadsheet, ImageDown, Link2, Lock, MousePointerSquareDashed, Smartphone, Upload } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { TypedName } from "@/components/landing/typed-name";
import { Button } from "@/components/ui/button";

const steps = [
  { icon: Upload, title: "Upload your design", body: "Any PNG, JPG or WebP — straight from Canva, Photoshop or your designer." },
  { icon: MousePointerSquareDashed, title: "Mark the fields", body: "Draw boxes where names, tables or messages go. Pick fonts, colours and alignment." },
  { icon: Link2, title: "Share a link", body: "Guests or organisers fill in the fields and download a print-ready PNG or PDF instantly." },
];

const features = [
  { icon: ImageDown, title: "Print-ready PNG or PDF", body: "Full resolution of your original artwork, tagged 300 DPI so it prints at its true size." },
  { icon: FileSpreadsheet, title: "Hundreds at once", body: "Upload a CSV or Excel guest list and download one ZIP of personalised invites." },
  { icon: Smartphone, title: "Made for phones", body: "Fill in, preview and download on any device — there's no app to install." },
  { icon: Lock, title: "Private by design", body: "Invites are made on the guest's own device. Nothing they create is stored." },
];

const guests = [
  ["Amara Okafor", "Table 4"],
  ["Dr. Wanjiru Kamau", "Table 1"],
  ["Tunde & Bisi Adeyemi", "Table 4"],
  ["Mercy Otieno", "Table 9"],
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-1 text-sm font-semibold text-muted-foreground md:flex">
            <a href="#how-it-works" className="rounded-md px-3 py-2 transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#bulk" className="rounded-md px-3 py-2 transition-colors hover:text-foreground">
              Guest lists
            </a>
            <a href="#features" className="rounded-md px-3 py-2 transition-colors hover:text-foreground">
              Features
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="lg" asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button size="lg" asChild>
              <Link href="/sign-up">
                <span>
                  Sign up<span className="hidden sm:inline"> for free</span>
                </span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b">
          <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 -z-10" />
          <Contours />
          <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 md:pt-24 lg:border-x">
            <div className="max-w-3xl">
              <p className="eyebrow">Weddings · Galas · Conferences · Launches</p>
              {/* The typed name sits on its own line so the heading never reflows as it changes. */}
              <h1 className="mt-5 text-[2.75rem] leading-[1.02] font-medium tracking-[-0.035em] sm:text-6xl lg:text-7xl">
                One design.
                <br />
                An invite for
                <br />
                <TypedName />
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
                Turn your invitation artwork into a link anyone can use. Every guest gets their name in your fonts, on your design, as a
                print-ready PNG or PDF.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button size="lg" className="h-11 px-5 text-[0.9375rem]" asChild>
                  <Link href="/sign-up">
                    Create your first invite <ArrowRight />
                  </Link>
                </Button>
                {/* A share link, styled like a terminal command pill. */}
                <div className="flex h-11 items-center overflow-hidden rounded-full border border-foreground/15 bg-card font-mono text-sm">
                  <span className="flex h-full items-center border-r border-foreground/10 px-4 text-muted-foreground">link</span>
                  <span className="truncate px-4">invites.app/i/amara-tunde</span>
                </div>
              </div>
              <p className="eyebrow mt-6 text-[0.6875rem]">Works with exports from Canva · Photoshop · Figma · Illustrator</p>
            </div>

            <ProductFrame />
          </div>
        </section>

        {/* ── Occasions band ──────────────────────────────────────────────── */}
        <section className="border-b bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-6 sm:px-6 lg:justify-between lg:border-x">
            {["Weddings", "Galas", "Conferences", "Graduations", "Launches", "Fundraisers"].map((o) => (
              <span key={o} className="eyebrow text-[0.8125rem]">
                {o}
              </span>
            ))}
          </div>
        </section>

        {/* ── How it works ────────────────────────────────────────────────── */}
        <section id="how-it-works" className="scroll-mt-16 border-b">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:border-x">
            <p className="eyebrow">How it works</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-medium tracking-[-0.025em] sm:text-4xl">From one design to every guest</h2>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">Set it up once. Then anyone with the link makes their own.</p>
            <ol className="mt-12 grid gap-4 md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="flex flex-col rounded-lg border bg-card p-6">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                    <step.icon className="size-5 text-brand-ink" />
                  </div>
                  <h3 className="mt-10 text-xl font-medium">{step.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Bulk ────────────────────────────────────────────────────────── */}
        <section id="bulk" className="scroll-mt-16 border-b">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-2 lg:border-x">
            <div>
              <p className="eyebrow">Guest lists</p>
              <h2 className="mt-3 text-3xl font-medium tracking-[-0.025em] sm:text-4xl">The whole list, in one ZIP</h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                Drop in a CSV or Excel sheet. Columns are matched to your fields automatically, problem rows are flagged before anything is
                made, and every invite lands in a single download.
              </p>
              <Link href="/sign-up" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-brand-ink hover:underline">
                Try it with your list <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <span className="eyebrow">guests.csv</span>
                <span className="font-mono text-xs text-muted-foreground">120 rows</span>
              </div>
              <ul className="divide-y">
                {guests.map(([name, table], i) => (
                  <li key={name} className="flex items-center gap-4 px-4 py-3 font-mono text-[0.8125rem]">
                    <span className="w-6 text-muted-foreground">{String(i + 2).padStart(2, "0")}</span>
                    <span className="flex-1 truncate">{name}</span>
                    <span className="text-muted-foreground">{table}</span>
                    <span className="text-xs text-[oklch(0.5_0.1_150)]">ready</span>
                  </li>
                ))}
              </ul>
              <div className="border-t p-4">
                <div className="flex h-10 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                  <FileArchive className="size-4" /> Download ZIP · 120 invites
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ────────────────────────────────────────────────────── */}
        <section id="features" className="scroll-mt-16 border-b">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:border-x">
            <p className="eyebrow">Features</p>
            <h2 className="mt-3 text-3xl font-medium tracking-[-0.025em] sm:text-4xl">Built for the night itself</h2>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((f) => (
                <div key={f.title} className="rounded-lg border bg-card p-5">
                  <f.icon className="size-5 text-brand-ink" />
                  <h3 className="mt-6 font-semibold tracking-[-0.01em]">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Closing CTA ─────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-surface">
          <Contours />
          <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 lg:border-x">
            <h2 className="mx-auto max-w-2xl text-3xl font-medium tracking-[-0.03em] text-balance sm:text-5xl">
              Your first invite is a few minutes away
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">Free to start. No design changes needed.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" className="h-11 px-6 text-[0.9375rem]" asChild>
                <Link href="/sign-up">Sign up for free</Link>
              </Button>
              <Button size="lg" variant="outline" className="h-11 px-6 text-[0.9375rem]" asChild>
                <Link href="#how-it-works">See how it works</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 sm:flex-row sm:px-6 lg:border-x">
          <Logo className="text-base" />
          <p className="font-mono text-xs text-muted-foreground">Invites are created on your device — nothing you generate is stored.</p>
        </div>
      </footer>
    </div>
  );
}

/** Hairline arcs in the page margins, outside the content rails. */
function Contours() {
  return (
    <>
      <div aria-hidden className="bg-contours pointer-events-none absolute inset-y-0 left-0 hidden w-[calc((100vw-72rem)/2)] lg:block" />
      <div
        aria-hidden
        className="bg-contours pointer-events-none absolute inset-y-0 right-0 hidden w-[calc((100vw-72rem)/2)] -scale-x-100 lg:block"
      />
    </>
  );
}

/** The guest page in miniature, framed and lit like a product shot. */
function ProductFrame() {
  return (
    <div className="relative mt-14 md:mt-20">
      <div aria-hidden className="glow-warm pointer-events-none absolute inset-x-0 -bottom-10 h-3/4" />
      <div className="relative overflow-hidden rounded-t-xl border border-b-0 border-foreground/15 bg-card shadow-[0_-20px_80px_-40px_oklch(0.55_0.15_40/0.6)]">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <span className="eyebrow text-[0.6875rem]">Personalised invite</span>
          <span className="ml-auto truncate font-mono text-xs text-muted-foreground">invites.app/i/amara-tunde</span>
        </div>
        <div className="grid gap-8 p-6 sm:p-10 md:grid-cols-[1.1fr_1fr] md:items-center">
          <SampleInvite />
          <div className="hidden gap-5 rounded-lg border bg-background/60 p-6 md:grid">
            <div className="flex items-baseline justify-between">
              <span className="eyebrow">Your details</span>
              <span className="font-mono text-[0.6875rem] text-muted-foreground">2 fields</span>
            </div>
            <FakeField label="Guest name" value="Dr. Wanjiru Kamau" focused />
            <FakeField label="Table" value="1" />
            <div className="grid gap-2 border-t pt-5">
              <div className="flex h-11 items-center justify-center gap-2 rounded-md bg-primary font-semibold text-primary-foreground">
                <ImageDown className="size-4" /> Download PNG
              </div>
              <div className="flex h-11 items-center justify-center gap-2 rounded-md border border-foreground/25 font-semibold">
                <FileDown className="size-4" /> Download PDF
              </div>
              <p className="text-center font-mono text-[0.6875rem] text-muted-foreground">PNG or PDF · 300 DPI · 148 × 210 mm</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FakeField({ label, value, focused }: { label: string; value: string; focused?: boolean }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <span
        className={
          focused
            ? "flex h-10 items-center rounded-md border border-brand bg-card px-3 text-sm ring-3 ring-brand/20"
            : "flex h-10 items-center rounded-md border border-input bg-card px-3 text-sm"
        }
      >
        {value}
      </span>
    </div>
  );
}

/** A static sample invite (the artwork a customer would upload). */
function SampleInvite() {
  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="aspect-[5/7] rounded-md border border-[oklch(0.85_0.03_70)] bg-[oklch(0.975_0.014_82)] p-6 text-center text-[oklch(0.32_0.035_45)] shadow-[0_20px_50px_-24px_oklch(0.35_0.06_45/0.5)]">
        <div className="flex h-full flex-col items-center justify-between rounded-sm border border-[oklch(0.78_0.06_62)] px-3 py-7">
          <p className="text-[0.6rem] tracking-[0.35em] uppercase">Together with their families</p>
          <div className="font-invite italic">
            <p className="text-4xl leading-tight">Amara</p>
            <p className="my-1 text-xl">&amp;</p>
            <p className="text-4xl leading-tight">Tunde</p>
          </div>
          <div className="w-full">
            <p className="text-[0.6rem] tracking-[0.3em] uppercase">request the pleasure of</p>
            <p className="mt-3 rounded-sm border-[1.5px] border-dashed border-brand/70 bg-brand/5 px-2 py-2 font-invite text-xl text-brand-ink italic">
              Dr. Wanjiru Kamau
            </p>
            <p className="mt-3 text-[0.7rem]">Saturday · 12 December 2026 · Nairobi</p>
          </div>
        </div>
      </div>
    </div>
  );
}
