// One-scroll landing page for Tama. Two registers, deliberately: warm
// brutalist pastel for most of it, and one dark high-contrast band (ink
// #16110c + electric lime #c4e538) that reassures a non-technical pet
// owner that setup is genuinely easy.
//
// Fully config-driven: every word comes from a `LandingContent` object
// (see content.ts), so EN and PT are a 1:1 structural map — the TypeScript
// type guarantees both languages fill the exact same slots, and these
// components are reused verbatim for either language. Adding a locale = add
// one entry to CONTENT; the components don't change.

import { type LandingContent, type Lang, type Segment } from "./content.ts";

const REPO_URL = "https://github.com/decocms/tama";
const STUDIO_IMPORT_URL = `https://studio.decocms.com/import?repo=${encodeURIComponent(
	REPO_URL,
)}`;
const DEMO_URL = "https://tama-example.deco-ceo.workers.dev";

// Structural meta that doesn't translate — colors + emojis, zipped with the
// localized text by index so the copy config stays purely words.
const CONCEPT_META = [
	{ emoji: "📜", color: "#b6e3c8" },
	{ emoji: "💊", color: "#ffbd8e" },
	{ emoji: "📥", color: "#c9b6f0" },
];
const FEATURE_META = [
	{ emoji: "📜", color: "#b6e3c8" },
	{ emoji: "💊", color: "#ffbd8e" },
	{ emoji: "📥", color: "#c9b6f0" },
	{ emoji: "📈", color: "#dff5dc" },
	{ emoji: "🩺", color: "#fde0e0" },
	{ emoji: "🔔", color: "#fff1d6" },
	{ emoji: "🔬", color: "#b6e3c8" },
	{ emoji: "🧠", color: "#ffbd8e" },
	{ emoji: "🐣", color: "#c9b6f0" },
];
const PRIVACY_EMOJI = ["🔒", "🆓", "🛠️"];

// Two-option flag pill: 🇺🇸 EN / 🇧🇷 BR. The active locale is filled in; each
// option is a real link to /en or /pt (full navigation re-renders the page in
// that language). Reused in the header and footer.
function LangSwitcher({
	lang,
	tone = "light",
}: {
	lang: Lang;
	tone?: "light" | "dark";
}) {
	const opts: { code: Lang; href: string; flag: string; label: string }[] = [
		{ code: "en", href: "/en", flag: "🇺🇸", label: "EN" },
		{ code: "pt", href: "/pt", flag: "🇧🇷", label: "BR" },
	];
	const border = tone === "dark" ? "border-[#fff8ee]/40" : "border-[#2a1f17]";
	const activeCls =
		tone === "dark"
			? "bg-[#fff8ee] text-[#2a1f17]"
			: "bg-[#2a1f17] text-[#fff8ee]";
	const idleCls =
		tone === "dark"
			? "text-[#fff8ee]/80 hover:bg-[#fff8ee]/10"
			: "text-[#2a1f17] hover:bg-[#2a1f17]/10";
	return (
		<div
			className={`inline-flex items-center rounded-full border-2 ${border} overflow-hidden text-xs font-bold`}
		>
			{opts.map((o) => (
				<a
					key={o.code}
					href={o.href}
					hrefLang={o.code}
					aria-current={o.code === lang ? "true" : undefined}
					className={`px-2.5 py-1 inline-flex items-center gap-1 ${
						o.code === lang ? activeCls : idleCls
					}`}
				>
					<span aria-hidden>{o.flag}</span>
					{o.label}
				</a>
			))}
		</div>
	);
}

// Render a headline that mixes plain text with highlighter-marked words.
function Headline({ segments }: { segments: Segment[] }) {
	return (
		<>
			{segments.map((s, i) =>
				typeof s === "string" ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: static, stable copy
					<span key={i}>{s}</span>
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: static, stable copy
					<span key={i} className="headline-mark">
						{s.mark}
					</span>
				),
			)}
		</>
	);
}

export function Landing({ c, lang }: { c: LandingContent; lang: Lang }) {
	return (
		<main className="min-h-dvh">
			<Hero c={c} lang={lang} />
			<ThreeConcepts c={c} />
			<TwoPaths c={c} />
			<WhatsInside c={c} />
			<HowItWorks c={c} />
			<LiveDemo c={c} />
			<Privacy c={c} />
			<BuiltOnStudio c={c} />
			<FAQ c={c} />
			<Footer c={c} lang={lang} />
		</main>
	);
}

function Hero({ c, lang }: { c: LandingContent; lang: Lang }) {
	return (
		<section className="px-6 md:px-12 pt-12 pb-20 md:pt-20 md:pb-32 border-b-4 border-[#2a1f17]">
			<nav className="max-w-6xl mx-auto flex items-center justify-between mb-16">
				<div className="flex items-center gap-2 font-bold text-xl">
					<span className="inline-block w-7 h-7 bg-[#ffbd8e] border-2 border-[#2a1f17]" />
					Tama
				</div>
				<div className="flex items-center gap-2 md:gap-4 text-sm">
					<LangSwitcher lang={lang} />
					<a
						href={DEMO_URL}
						className="hover:underline underline-offset-4 decoration-2"
					>
						{c.nav.demo}
					</a>
					<a
						href={REPO_URL}
						className="hover:underline underline-offset-4 decoration-2"
					>
						{c.nav.github}
					</a>
					<a
						href={STUDIO_IMPORT_URL}
						className="brut bg-[#2a1f17] text-[#fff8ee] px-4 py-2 font-bold inline-flex items-center gap-2 border-2 border-[#2a1f17]"
					>
						{c.nav.cta}
					</a>
				</div>
			</nav>

			<div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
				<div>
					<div className="inline-block mb-5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#2a1f17]/55">
						{c.hero.badge}
					</div>
					<h1 className="headline text-5xl md:text-7xl mb-6">
						<Headline segments={c.hero.title} />
					</h1>
					<p className="text-lg md:text-xl text-[#2a1f17]/80 leading-snug mb-8 max-w-md">
						{c.hero.sub}
					</p>
					<div className="flex flex-wrap gap-3">
						<a
							href={STUDIO_IMPORT_URL}
							className="brut bg-[#ffbd8e] text-[#2a1f17] px-6 py-4 font-bold text-lg border-2 border-[#2a1f17] inline-flex items-center gap-2"
						>
							{c.hero.ctaPrimary}
						</a>
						<a
							href={DEMO_URL}
							className="brut bg-[#fff8ee] text-[#2a1f17] px-6 py-4 font-bold text-lg border-2 border-[#2a1f17] inline-flex items-center gap-2"
						>
							{c.hero.ctaSecondary}
						</a>
					</div>
					<p className="mt-4 text-xs text-[#2a1f17]/60">{c.hero.footnote}</p>
				</div>

				<div className="flex items-center justify-center">
					<div className="relative">
						<div
							className="face-cycle sprite"
							style={{ width: 384, height: 384 }}
							aria-hidden
						/>
						<div className="absolute -bottom-4 left-1/2 -translate-x-1/2 brut bg-[#b6e3c8] border-2 border-[#2a1f17] px-3 py-1 text-xs font-bold whitespace-nowrap">
							{c.hero.petTag}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

// The three core concepts, foregrounded right under the hero.
function ThreeConcepts({ c }: { c: LandingContent }) {
	return (
		<section className="px-6 md:px-12 py-20 md:py-28 border-b-4 border-[#2a1f17] bg-[#fff8ee]">
			<div className="max-w-6xl mx-auto">
				<div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#2a1f17]/55 mb-4">
					{c.concepts.kicker}
				</div>
				<h2 className="headline text-4xl md:text-6xl mb-3 max-w-3xl">
					<Headline segments={c.concepts.title} />
				</h2>
				<p className="text-lg text-[#2a1f17]/70 mb-12 max-w-2xl">
					{c.concepts.sub}
				</p>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-5">
					{c.concepts.cards.map((card, i) => (
						<div
							key={card.kicker}
							className="brut p-7 border-2 border-[#2a1f17]"
							style={{ backgroundColor: CONCEPT_META[i].color }}
						>
							<div className="text-4xl mb-4" aria-hidden>
								{CONCEPT_META[i].emoji}
							</div>
							<div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#2a1f17]/55 mb-2">
								{card.kicker}
							</div>
							<h3 className="headline text-2xl mb-3">{card.title}</h3>
							<p className="text-sm text-[#2a1f17]/85 leading-relaxed">
								{card.body}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

function TwoPaths({ c }: { c: LandingContent }) {
	return (
		<section className="bg-[#16110c] text-[#fff8ee] px-6 md:px-12 py-24 md:py-36 border-b-4 border-[#16110c] overflow-hidden">
			<div className="max-w-5xl mx-auto">
				<div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#c4e538] mb-8">
					{c.twoPaths.kicker}
				</div>
				<h2 className="headline text-4xl md:text-6xl leading-[0.98] mb-12">
					<Headline segments={c.twoPaths.title} />
				</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div className="border-2 border-[#fff8ee]/20 p-7 hover:border-[#c4e538]/50 transition-colors">
						<div className="text-3xl mb-3" aria-hidden>
							👩‍💻
						</div>
						<h3 className="headline text-2xl mb-3">{c.twoPaths.dev.title}</h3>
						<p className="text-base md:text-lg text-[#fff8ee]/80 leading-relaxed">
							{c.twoPaths.dev.body}
						</p>
					</div>
					<div className="border-2 border-[#fff8ee]/20 p-7 hover:border-[#c4e538]/50 transition-colors">
						<div className="text-3xl mb-3" aria-hidden>
							🐾
						</div>
						<h3 className="headline text-2xl mb-3">{c.twoPaths.nonDev.title}</h3>
						<p className="text-base md:text-lg text-[#fff8ee]/80 leading-relaxed">
							{c.twoPaths.nonDev.body}
						</p>
					</div>
				</div>
				<p className="mt-10 text-lg md:text-xl text-[#fff8ee]/70 max-w-3xl">
					{c.twoPaths.footer}
				</p>
			</div>
		</section>
	);
}

function WhatsInside({ c }: { c: LandingContent }) {
	return (
		<section className="px-6 md:px-12 py-20 md:py-28 border-b-4 border-[#2a1f17]">
			<div className="max-w-6xl mx-auto">
				<h2 className="headline text-4xl md:text-6xl mb-3">
					{c.whatsInside.title}
				</h2>
				<p className="text-lg text-[#2a1f17]/70 mb-12 max-w-xl">
					{c.whatsInside.sub}
				</p>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
					{c.whatsInside.features.map((f, i) => (
						<div
							key={f.title}
							className="brut p-5 border-2 border-[#2a1f17]"
							style={{ backgroundColor: FEATURE_META[i].color }}
						>
							<div className="text-3xl mb-2" aria-hidden>
								{FEATURE_META[i].emoji}
							</div>
							<h3 className="headline text-xl mb-2">{f.title}</h3>
							<p className="text-sm text-[#2a1f17]/85 leading-relaxed">
								{f.body}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

function HowItWorks({ c }: { c: LandingContent }) {
	return (
		<section className="px-6 md:px-12 py-20 md:py-28 bg-[#fff1d6] border-b-4 border-[#2a1f17]">
			<div className="max-w-6xl mx-auto">
				<h2 className="headline text-4xl md:text-6xl mb-3">
					{c.howItWorks.title}
				</h2>
				<p className="text-lg text-[#2a1f17]/70 mb-12 max-w-xl">
					{c.howItWorks.sub}
				</p>
				<ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
					{c.howItWorks.steps.map((s) => (
						<li
							key={s.n}
							className="brut p-6 border-2 border-[#2a1f17] bg-[#fff8ee]"
						>
							<div className="headline text-5xl text-[#ffbd8e] mb-3">{s.n}</div>
							<h3 className="headline text-xl mb-2">{s.title}</h3>
							<p className="text-sm text-[#2a1f17]/85">{s.body}</p>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}

function LiveDemo({ c }: { c: LandingContent }) {
	return (
		<section className="px-6 md:px-12 py-20 md:py-28 border-b-4 border-[#2a1f17]">
			<div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
				<div>
					<h2 className="headline text-4xl md:text-5xl mb-4">
						{c.liveDemo.title}
					</h2>
					<p className="text-lg text-[#2a1f17]/80 mb-6">{c.liveDemo.sub}</p>
					<a
						href={DEMO_URL}
						className="brut inline-block bg-[#c9b6f0] border-2 border-[#2a1f17] px-6 py-4 font-bold text-lg"
					>
						{c.liveDemo.cta}
					</a>
				</div>
				<div className="brut border-2 border-[#2a1f17] bg-[#fff8ee] p-4 aspect-video flex items-center justify-center">
					<div className="text-center">
						<div
							className="face-cycle sprite mx-auto mb-2"
							style={{ width: 128, height: 128 }}
						/>
						<p className="text-xs text-[#2a1f17]/70 font-mono">
							{c.liveDemo.caption}
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}

function Privacy({ c }: { c: LandingContent }) {
	return (
		<section className="px-6 md:px-12 py-20 md:py-28 bg-[#dff5dc] border-b-4 border-[#2a1f17]">
			<div className="max-w-6xl mx-auto">
				<h2 className="headline text-4xl md:text-6xl mb-3">{c.privacy.title}</h2>
				<p className="text-lg text-[#2a1f17]/70 mb-12 max-w-2xl">
					{c.privacy.sub}
				</p>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					{c.privacy.items.map((it, i) => (
						<div
							key={it.title}
							className="brut p-6 border-2 border-[#2a1f17] bg-[#fff8ee]"
						>
							<div className="text-3xl mb-2" aria-hidden>
								{PRIVACY_EMOJI[i]}
							</div>
							<h3 className="headline text-xl mb-2">{it.title}</h3>
							<p className="text-sm text-[#2a1f17]/85">{it.body}</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

function BuiltOnStudio({ c }: { c: LandingContent }) {
	return (
		<section className="px-6 md:px-12 py-20 md:py-28 border-b-4 border-[#2a1f17]">
			<div className="max-w-4xl mx-auto text-center">
				<p className="text-sm uppercase tracking-[0.2em] text-[#2a1f17]/60 mb-4 font-bold">
					{c.studio.kicker}
				</p>
				<h2 className="headline text-4xl md:text-5xl mb-4">{c.studio.title}</h2>
				<p className="text-lg text-[#2a1f17]/80 mb-6 max-w-2xl mx-auto">
					{c.studio.body}
				</p>
				<a
					href="https://studio.decocms.com"
					className="brut inline-block bg-[#2a1f17] text-[#fff8ee] border-2 border-[#2a1f17] px-6 py-3 font-bold"
				>
					{c.studio.cta}
				</a>
			</div>
		</section>
	);
}

function FAQ({ c }: { c: LandingContent }) {
	return (
		<section className="px-6 md:px-12 py-20 md:py-28 bg-[#fde0e0] border-b-4 border-[#2a1f17]">
			<div className="max-w-3xl mx-auto">
				<h2 className="headline text-4xl md:text-6xl mb-12">{c.faq.title}</h2>
				<dl className="space-y-6">
					{c.faq.items.map((it) => (
						<div
							key={it.q}
							className="brut p-6 border-2 border-[#2a1f17] bg-[#fff8ee]"
						>
							<dt className="headline text-xl mb-2">{it.q}</dt>
							<dd className="text-sm text-[#2a1f17]/85 leading-relaxed">
								{it.a}
							</dd>
						</div>
					))}
				</dl>
			</div>
		</section>
	);
}

function Footer({ c, lang }: { c: LandingContent; lang: Lang }) {
	return (
		<footer className="px-6 md:px-12 py-12 bg-[#2a1f17] text-[#fff8ee]">
			<div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
				<div>
					<div className="flex items-center gap-2 font-bold text-xl mb-2">
						<span className="inline-block w-7 h-7 bg-[#ffbd8e] border-2 border-[#fff8ee]" />
						Tama
					</div>
					<p className="text-xs text-[#fff8ee]/60 max-w-sm">{c.footer.tagline}</p>
				</div>
				<div className="flex items-center gap-6 text-sm">
					<LangSwitcher lang={lang} tone="dark" />
					<a href={REPO_URL} className="hover:underline">
						{c.footer.github}
					</a>
					<a href="https://studio.decocms.com" className="hover:underline">
						{c.footer.studio}
					</a>
					<a href={`${REPO_URL}/blob/main/LICENSE`} className="hover:underline">
						{c.footer.license}
					</a>
				</div>
			</div>
		</footer>
	);
}
