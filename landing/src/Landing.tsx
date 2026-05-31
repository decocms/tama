// One-scroll landing page for Tama. Brutalist bones (oversized type, hard
// shadows, chunky cards, raw HTML semantics) wrapped in a warm pastel
// palette so it doesn't feel cold. Plain React, no router, no fetches —
// just a manifesto. Ships to Cloudflare Pages as static HTML+JS.

const REPO_URL = "https://github.com/deco-cx/tama"; // update on first publish
const STUDIO_IMPORT_URL = `https://studio.decocms.com/import?repo=${encodeURIComponent(
	REPO_URL,
)}`;
const DEMO_URL = "https://tama-example.deco-ceo.workers.dev";

export function Landing() {
	return (
		<main className="min-h-dvh">
			<Hero />
			<WhatIsTama />
			<HowItWorks />
			<LiveDemo />
			<Privacy />
			<BuiltOnStudio />
			<FAQ />
			<Footer />
		</main>
	);
}

function Hero() {
	return (
		<section className="px-6 md:px-12 pt-12 pb-20 md:pt-20 md:pb-32 border-b-4 border-[#2a1f17]">
			<nav className="max-w-6xl mx-auto flex items-center justify-between mb-16">
				<div className="flex items-center gap-2 font-bold text-xl">
					<span className="inline-block w-7 h-7 bg-[#ffbd8e] border-2 border-[#2a1f17]" />
					Tama
				</div>
				<div className="flex items-center gap-2 md:gap-4 text-sm">
					<a
						href={DEMO_URL}
						className="hover:underline underline-offset-4 decoration-2"
					>
						Demo
					</a>
					<a
						href={REPO_URL}
						className="hover:underline underline-offset-4 decoration-2"
					>
						GitHub
					</a>
					<a
						href={STUDIO_IMPORT_URL}
						className="brut bg-[#2a1f17] text-[#fff8ee] px-4 py-2 font-bold inline-flex items-center gap-2 border-2 border-[#2a1f17]"
					>
						Deploy yours →
					</a>
				</div>
			</nav>

			<div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
				<div>
					<h1 className="headline text-5xl md:text-7xl mb-6">
						A tamagotchi for your <span className="bg-[#ffbd8e] px-2">real</span>{" "}
						pet.
					</h1>
					<p className="text-lg md:text-xl text-[#2a1f17]/80 leading-snug mb-8 max-w-md">
						One pet, one agent, one deploy. Track meds, log doses, chart exam
						evolution — and keep a tiny pixel version of them on your home
						screen.
					</p>
					<div className="flex flex-wrap gap-3">
						<a
							href={STUDIO_IMPORT_URL}
							className="brut bg-[#ffbd8e] text-[#2a1f17] px-6 py-4 font-bold text-lg border-2 border-[#2a1f17] inline-flex items-center gap-2"
						>
							Deploy your Tama, free →
						</a>
						<a
							href={DEMO_URL}
							className="brut bg-[#fff8ee] text-[#2a1f17] px-6 py-4 font-bold text-lg border-2 border-[#2a1f17] inline-flex items-center gap-2"
						>
							See the live demo
						</a>
					</div>
					<p className="mt-4 text-xs text-[#2a1f17]/60">
						Free forever · Your data lives in your own Cloudflare account
					</p>
				</div>

				<div className="flex items-center justify-center">
					<div className="relative">
						<div
							className="face-cycle sprite"
							style={{ width: 384, height: 384 }}
							aria-hidden
						/>
						<div className="absolute -bottom-4 left-1/2 -translate-x-1/2 brut bg-[#b6e3c8] border-2 border-[#2a1f17] px-3 py-1 text-xs font-bold whitespace-nowrap">
							Beto, Chihuahua, 6 yrs
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

function WhatIsTama() {
	return (
		<section className="px-6 md:px-12 py-20 md:py-28 border-b-4 border-[#2a1f17]">
			<div className="max-w-6xl mx-auto">
				<h2 className="headline text-4xl md:text-6xl mb-3">
					Three things in one.
				</h2>
				<p className="text-lg text-[#2a1f17]/70 mb-12 max-w-xl">
					Not a SaaS. Not a tracker. A small, lovable, self-deployed thing.
				</p>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					<FeatureCard
						emoji="🩺"
						color="#b6e3c8"
						title="A medical log"
						body="Upload exams as PDF or photo — the agent extracts every parameter, charts evolution over time, and links each result to a care episode. Doses logged on the timetable, late ones nudge you. Vet research grounded in your pet's history."
					/>
					<FeatureCard
						emoji="🤖"
						color="#ffbd8e"
						title="An agent for your pet"
						body="The deployed worker is an MCP server. Studio imports it, and the same chat becomes admin: 'Did I give Beto his Prelone?' 'What was his hemoglobin trend?' 'Look up Sucralfate side effects.' Context is sharp because there's only one pet."
					/>
					<FeatureCard
						emoji="🐣"
						color="#c9b6f0"
						title="A tamagotchi"
						body="Add /companion to your home screen as a PWA. A small pixel version of your pet sits in your dock or on your phone, blinking, sleeping, looking hungry when a meal's late. Tap to expand into the full dashboard."
					/>
				</div>
			</div>
		</section>
	);
}

function FeatureCard({
	emoji,
	color,
	title,
	body,
}: {
	emoji: string;
	color: string;
	title: string;
	body: string;
}) {
	return (
		<div
			className="brut p-6 border-2 border-[#2a1f17]"
			style={{ backgroundColor: color }}
		>
			<div className="text-4xl mb-3" aria-hidden>
				{emoji}
			</div>
			<h3 className="headline text-2xl mb-2">{title}</h3>
			<p className="text-sm text-[#2a1f17]/85 leading-relaxed">{body}</p>
		</div>
	);
}

function HowItWorks() {
	const steps = [
		{
			n: "01",
			title: "Fork",
			body: "Click Import in Studio. Or fork the GitHub repo the old-fashioned way.",
		},
		{
			n: "02",
			title: "Claim",
			body: "Studio's coding-agent reads AGENTS.md and walks you through a conversation: name, breed, photo, timezone. Edits the config, generates a 6-state pixel sprite from your photo, commits.",
		},
		{
			n: "03",
			title: "Deploy",
			body: "Same Studio session creates the D1 database, R2 bucket, VAPID push keys, and runs wrangler deploy. Ends with a URL.",
		},
		{
			n: "04",
			title: "Operate",
			body: "The deployed worker exposes /mcp. Studio imports it as an MCP server, and the same chat becomes your day-to-day admin panel.",
		},
	];
	return (
		<section className="px-6 md:px-12 py-20 md:py-28 bg-[#fff1d6] border-b-4 border-[#2a1f17]">
			<div className="max-w-6xl mx-auto">
				<h2 className="headline text-4xl md:text-6xl mb-3">
					How it works.
				</h2>
				<p className="text-lg text-[#2a1f17]/70 mb-12 max-w-xl">
					Four steps. The agent does the boring parts. You answer questions
					about your pet.
				</p>
				<ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
					{steps.map((s) => (
						<li
							key={s.n}
							className="brut p-6 border-2 border-[#2a1f17] bg-[#fff8ee]"
						>
							<div className="headline text-5xl text-[#ffbd8e] mb-3">
								{s.n}
							</div>
							<h3 className="headline text-xl mb-2">{s.title}</h3>
							<p className="text-sm text-[#2a1f17]/85">{s.body}</p>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}

function LiveDemo() {
	return (
		<section className="px-6 md:px-12 py-20 md:py-28 border-b-4 border-[#2a1f17]">
			<div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
				<div>
					<h2 className="headline text-4xl md:text-5xl mb-4">
						A real, working Tama.
					</h2>
					<p className="text-lg text-[#2a1f17]/80 mb-6">
						The demo deploy uses placeholder data — explore the dashboard,
						upload a sample exam, watch the companion react. No signup.
					</p>
					<a
						href={DEMO_URL}
						className="brut inline-block bg-[#c9b6f0] border-2 border-[#2a1f17] px-6 py-4 font-bold text-lg"
					>
						Open the demo →
					</a>
				</div>
				<div className="brut border-2 border-[#2a1f17] bg-[#fff8ee] p-4 aspect-video flex items-center justify-center">
					<div className="text-center">
						<div className="face-cycle sprite mx-auto mb-2" style={{ width: 128, height: 128 }} />
						<p className="text-xs text-[#2a1f17]/70 font-mono">
							tama-example.workers.dev
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}

function Privacy() {
	const items = [
		{
			emoji: "🔒",
			title: "Your data, your account",
			body: "The D1 database, the R2 files, the push subscriptions — everything lives in your own Cloudflare account. We never see a byte of it.",
		},
		{
			emoji: "🆓",
			title: "Free forever",
			body: "Cloudflare's free tier handles a single-pet deploy without breaking a sweat. No subscription, no usage metering, no surprise bills.",
		},
		{
			emoji: "🛠️",
			title: "Fork and customize",
			body: "The repo is yours. Want different metrics on the dashboard? A weight-only tracker? A goldfish edition? Edit the code or ask Studio to.",
		},
	];
	return (
		<section className="px-6 md:px-12 py-20 md:py-28 bg-[#dff5dc] border-b-4 border-[#2a1f17]">
			<div className="max-w-6xl mx-auto">
				<h2 className="headline text-4xl md:text-6xl mb-3">
					Your pet, your deploy.
				</h2>
				<p className="text-lg text-[#2a1f17]/70 mb-12 max-w-2xl">
					Medical history is sensitive. We thought hard about where it lives.
					The answer was easy: not with us.
				</p>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					{items.map((it) => (
						<div
							key={it.title}
							className="brut p-6 border-2 border-[#2a1f17] bg-[#fff8ee]"
						>
							<div className="text-3xl mb-2" aria-hidden>
								{it.emoji}
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

function BuiltOnStudio() {
	return (
		<section className="px-6 md:px-12 py-20 md:py-28 border-b-4 border-[#2a1f17]">
			<div className="max-w-4xl mx-auto text-center">
				<p className="text-sm uppercase tracking-[0.2em] text-[#2a1f17]/60 mb-4 font-bold">
					Powered by
				</p>
				<h2 className="headline text-4xl md:text-5xl mb-4">
					Built on deco studio.
				</h2>
				<p className="text-lg text-[#2a1f17]/80 mb-6 max-w-2xl mx-auto">
					Studio is the agentic dev environment Tama runs on — code, deploy,
					and operate from one chat. Tama is the personal-use side of the same
					primitives that ship in production at scale.
				</p>
				<a
					href="https://studio.decocms.com"
					className="brut inline-block bg-[#2a1f17] text-[#fff8ee] border-2 border-[#2a1f17] px-6 py-3 font-bold"
				>
					studio.decocms.com →
				</a>
			</div>
		</section>
	);
}

function FAQ() {
	const items = [
		{
			q: "Do I need to be a developer?",
			a: "Not really. The Studio coding-agent walks you through every step — claiming, deploying, hooking up notifications. You'll need a free Cloudflare account; the agent handles the rest. If you've never used wrangler, that's fine.",
		},
		{
			q: "What does it cost on Cloudflare?",
			a: "Almost certainly $0. Workers + D1 + R2 free tiers cover a single-pet deploy with room to spare. Workers AI (for the sprite generation) has a generous free tier too. If your pet somehow becomes the world's most-watched animal, you might need to add a credit card.",
		},
		{
			q: "Can I have multiple pets?",
			a: "Each pet gets its own deploy — fork the repo twice, run the claim flow twice. The thesis is one agent per pet so context stays sharp. (We thought hard about this; it's deliberate, not a missing feature.)",
		},
		{
			q: "What if my pet looks weird in the sprite?",
			a: "The companion has a 're-render Tama' button — upload a different photo, get a new sprite pack. The pipeline is two-pass (character extraction → image generation × 6 expressions) so identity stays consistent across moods, but model quality varies.",
		},
		{
			q: "What if I want to change the schema or add a feature?",
			a: "The repo is MIT-licensed, ~50 files of TypeScript. Open it in Studio and describe what you want — or read CLAUDE.md and dive in directly. There's nothing magic in here.",
		},
	];
	return (
		<section className="px-6 md:px-12 py-20 md:py-28 bg-[#fde0e0] border-b-4 border-[#2a1f17]">
			<div className="max-w-3xl mx-auto">
				<h2 className="headline text-4xl md:text-6xl mb-12">
					Questions.
				</h2>
				<dl className="space-y-6">
					{items.map((it) => (
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

function Footer() {
	return (
		<footer className="px-6 md:px-12 py-12 bg-[#2a1f17] text-[#fff8ee]">
			<div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
				<div>
					<div className="flex items-center gap-2 font-bold text-xl mb-2">
						<span className="inline-block w-7 h-7 bg-[#ffbd8e] border-2 border-[#fff8ee]" />
						Tama
					</div>
					<p className="text-xs text-[#fff8ee]/60 max-w-sm">
						Built for the one creature that matters.
					</p>
				</div>
				<div className="flex items-center gap-6 text-sm">
					<a href={REPO_URL} className="hover:underline">
						GitHub
					</a>
					<a href="https://studio.decocms.com" className="hover:underline">
						Studio
					</a>
					<a
						href={`${REPO_URL}/blob/main/LICENSE`}
						className="hover:underline"
					>
						MIT
					</a>
				</div>
			</div>
		</footer>
	);
}
