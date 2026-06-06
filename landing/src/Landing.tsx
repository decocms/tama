// One-scroll landing page for Tama. Two registers, deliberately: warm
// brutalist pastel for most of it, and one dark high-contrast band (ink
// #16110c + electric lime #c4e538) that reassures a non-technical pet
// owner that setup is genuinely easy. Friendly, inviting, no jargon.
// Plain React, no router, no fetches. Ships to Cloudflare Pages as static
// HTML+JS.

const REPO_URL = "https://github.com/decocms/tama";
const STUDIO_IMPORT_URL = `https://studio.decocms.com/import?repo=${encodeURIComponent(
	REPO_URL,
)}`;
const DEMO_URL = "https://tama-example.deco-ceo.workers.dev";

export function Landing() {
	return (
		<main className="min-h-dvh">
			<Hero />
			<ThreeConcepts />
			<TwoPaths />
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
						Create yours →
					</a>
				</div>
			</nav>

			<div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
				<div>
					<div className="inline-block mb-5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#2a1f17]/55">
						Free · Private · Set up in minutes
					</div>
					<h1 className="headline text-5xl md:text-7xl mb-6">
						An agent for{" "}
						<span className="headline-mark">your pet</span> to live a
						better life.
					</h1>
					<p className="text-lg md:text-xl text-[#2a1f17]/80 leading-snug mb-8 max-w-md">
						A complete health record for your pet — every visit, vaccine,
						medicine, and lab result in one continuous timeline. And an AI
						that knows the whole history, so you (and your vet) can
						understand your pet holistically and decide together what's next.
					</p>
					<div className="flex flex-wrap gap-3">
						<a
							href={STUDIO_IMPORT_URL}
							className="brut bg-[#ffbd8e] text-[#2a1f17] px-6 py-4 font-bold text-lg border-2 border-[#2a1f17] inline-flex items-center gap-2"
						>
							Create your pet's agent, free →
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
							Pixel, Chihuahua, 6 yrs
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

// The three core concepts, foregrounded right under the hero so the whole
// product reads as: one timeline, one timetable, drop anything in. Everything
// else (graphs, reminders, the companion) hangs off these three.
function ThreeConcepts() {
	const concepts = [
		{
			emoji: "📜",
			color: "#b6e3c8",
			kicker: "Timeline",
			title: "The whole story, one log.",
			body: "Every vet visit, vaccine, symptom, medicine given, and lab result — in one continuous, chronological record. Nothing siloed, nothing lost. The agent always has the full history when you or your vet ask.",
		},
		{
			emoji: "💊",
			color: "#ffbd8e",
			kicker: "Timetable",
			title: "Medicines, organized.",
			body: "A live schedule of every medicine and meal, with reminders that buzz your phone. Give a dose early or late and the schedule shifts to keep the interval — no math, no missed doses.",
		},
		{
			emoji: "📥",
			color: "#c9b6f0",
			kicker: "Assets",
			title: "Drop in anything.",
			body: "Upload a PDF, a photo, a vaccine card, a voice memo. The agent reads it and files it into the timeline for you — as an exam with charted values, a visit, a vaccine, or a note.",
		},
	];
	return (
		<section className="px-6 md:px-12 py-20 md:py-28 border-b-4 border-[#2a1f17] bg-[#fff8ee]">
			<div className="max-w-6xl mx-auto">
				<div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#2a1f17]/55 mb-4">
					Three simple ideas
				</div>
				<h2 className="headline text-4xl md:text-6xl mb-3 max-w-3xl">
					A <span className="headline-mark">timeline</span>, a{" "}
					<span className="headline-mark">timetable</span>, and a place to{" "}
					<span className="headline-mark">drop anything</span>.
				</h2>
				<p className="text-lg text-[#2a1f17]/70 mb-12 max-w-2xl">
					That's the whole product. Everything else — the graphs, the
					reminders, the AI your vet can talk to — grows out of these three.
				</p>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-5">
					{concepts.map((c) => (
						<div
							key={c.kicker}
							className="brut p-7 border-2 border-[#2a1f17]"
							style={{ backgroundColor: c.color }}
						>
							<div className="text-4xl mb-4" aria-hidden>
								{c.emoji}
							</div>
							<div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#2a1f17]/55 mb-2">
								{c.kicker}
							</div>
							<h3 className="headline text-2xl mb-3">{c.title}</h3>
							<p className="text-sm text-[#2a1f17]/85 leading-relaxed">
								{c.body}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

// Dark high-contrast band that splits cleanly into the two ways in:
// developers fork-and-vibecode, everyone else lets deco studio do it.
// Same bold register (ink + electric lime); the two-door framing makes
// the page feel "there's a path for me" no matter who's reading.
function TwoPaths() {
	return (
		<section className="bg-[#16110c] text-[#fff8ee] px-6 md:px-12 py-24 md:py-36 border-b-4 border-[#16110c] overflow-hidden">
			<div className="max-w-5xl mx-auto">
				<div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#c4e538] mb-8">
					Two ways in
				</div>
				<h2 className="headline text-4xl md:text-6xl leading-[0.98] mb-12">
					Set it up <span className="text-[#c4e538]">your</span> way.
				</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div className="border-2 border-[#fff8ee]/20 p-7 hover:border-[#c4e538]/50 transition-colors">
						<div className="text-3xl mb-3" aria-hidden>
							👩‍💻
						</div>
						<h3 className="headline text-2xl mb-3">You write code</h3>
						<p className="text-base md:text-lg text-[#fff8ee]/80 leading-relaxed">
							Fork the repo and vibecode it with Claude. There's an{" "}
							<code className="text-[#c4e538] font-mono text-[0.9em]">
								AGENTS.md
							</code>{" "}
							that tells your agent exactly what to do — set it up for your
							pet, then deploy to your own Cloudflare. You're in your
							terminal, you know the drill.
						</p>
					</div>
					<div className="border-2 border-[#fff8ee]/20 p-7 hover:border-[#c4e538]/50 transition-colors">
						<div className="text-3xl mb-3" aria-hidden>
							🐾
						</div>
						<h3 className="headline text-2xl mb-3">You don't? No problem</h3>
						<p className="text-base md:text-lg text-[#fff8ee]/80 leading-relaxed">
							Use{" "}
							<span className="text-[#fff8ee] font-semibold">deco studio</span>.
							Paste the Tama link and the agent walks you through
							everything — even making your GitHub and Cloudflare accounts,
							setting up your pet, and going live. No terminal, no code, no
							stress.
						</p>
					</div>
				</div>
				<p className="mt-10 text-lg md:text-xl text-[#fff8ee]/70 max-w-3xl">
					Either way, you bring the pet — Tama brings everything else.
				</p>
			</div>
		</section>
	);
}

const FEATURES = [
	{
		emoji: "📜",
		color: "#b6e3c8",
		title: "One continuous timeline",
		body: "Every vet visit, vaccine, symptom, medicine, exam, and note in one chronological log. The whole story of your pet's life — so nothing about their health ever falls through the cracks.",
	},
	{
		emoji: "💊",
		color: "#ffbd8e",
		title: "Medicine timetable",
		body: "A live schedule for every medicine and meal. Doses given early or late shift the schedule to keep the interval — no math, no missed doses.",
	},
	{
		emoji: "📥",
		color: "#c9b6f0",
		title: "Assets — drop anything",
		body: "Upload any document, lab report, vaccine card, or recording. The agent reads it and files it into the timeline automatically — as an exam, a visit, a vaccine, or a note.",
	},
	{
		emoji: "📈",
		color: "#dff5dc",
		title: "Lab exam graphs",
		body: "Lab values are extracted and charted over time, so you and your vet can see a trend — hemoglobin recovering, kidney values holding — at a glance.",
	},
	{
		emoji: "🩺",
		color: "#fde0e0",
		title: "An AI your vet can talk to",
		body: "Your vet (or a second opinion) can ask the agent about your pet's full history in plain language, and collaborate on the case with the complete record in front of them.",
	},
	{
		emoji: "🔔",
		color: "#fff1d6",
		title: "Push reminders",
		body: "When a dose is due, your phone or laptop buzzes. Works from the home-screen app on iOS + Android.",
	},
	{
		emoji: "🔬",
		color: "#b6e3c8",
		title: "Grounded vet research",
		body: "Ask about drug interactions, side effects, or what to expect — answers are searched against the literature with your pet's actual meds and history attached.",
	},
	{
		emoji: "🧠",
		color: "#ffbd8e",
		title: "Living health summary",
		body: "One evolving paragraph — where your pet stands right now, what's active, what to watch — regenerated from the whole timeline whenever you ask.",
	},
	{
		emoji: "🐣",
		color: "#c9b6f0",
		title: "Pixel companion",
		body: "Add it to your home screen. A tiny pixel face of your pet that reacts to the schedule — sleeping at night, looking concerned when meds are late.",
	},
];

function WhatIsTama() {
	return (
		<section className="px-6 md:px-12 py-20 md:py-28 border-b-4 border-[#2a1f17]">
			<div className="max-w-6xl mx-auto">
				<h2 className="headline text-4xl md:text-6xl mb-3">
					What's inside.
				</h2>
				<p className="text-lg text-[#2a1f17]/70 mb-12 max-w-xl">
					Nine things, one place — all working together because they're all
					about the same pet.
				</p>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
					{FEATURES.map((f) => (
						<FeatureCard
							key={f.title}
							emoji={f.emoji}
							color={f.color}
							title={f.title}
							body={f.body}
						/>
					))}
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
			className="brut p-5 border-2 border-[#2a1f17]"
			style={{ backgroundColor: color }}
		>
			<div className="text-3xl mb-2" aria-hidden>
				{emoji}
			</div>
			<h3 className="headline text-xl mb-2">{title}</h3>
			<p className="text-sm text-[#2a1f17]/85 leading-relaxed">{body}</p>
		</div>
	);
}

function HowItWorks() {
	const steps = [
		{
			n: "01",
			title: "Open it",
			body: "Go to deco studio and point it at Tama. One click — no downloads, nothing to install.",
		},
		{
			n: "02",
			title: "Introduce your pet",
			body: "The agent asks a few friendly questions — name, breed, a photo, your vet's notes. It even draws a little pixel version of them from the photo.",
		},
		{
			n: "03",
			title: "Go live",
			body: "Connect a free Cloudflare account when it asks. The agent handles all the setup and hands you a link to your pet's page.",
		},
		{
			n: "04",
			title: "Use it every day",
			body: "Add it to your phone's home screen. From then on, just talk to it — upload an exam, log a medicine, ask a question.",
		},
	];
	return (
		<section className="px-6 md:px-12 py-20 md:py-28 bg-[#fff1d6] border-b-4 border-[#2a1f17]">
			<div className="max-w-6xl mx-auto">
				<h2 className="headline text-4xl md:text-6xl mb-3">
					How it works.
				</h2>
				<p className="text-lg text-[#2a1f17]/70 mb-12 max-w-xl">
					Four steps, mostly just answering questions. The agent does
					everything technical for you.
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
						The demo is seeded with a real example pet — Pixel, recovering
						from anemia. Scroll the timeline, watch the hemoglobin trend
						climb, check the medicine timetable, see the companion react.
						No signup.
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
			body: "Everything — exams, photos, your pet's whole history — lives in your own free Cloudflare account. We never see a single byte of it.",
		},
		{
			emoji: "🆓",
			title: "Free forever",
			body: "Cloudflare's free tier covers one pet easily. No subscription, no monthly fee, no surprise bills. You'll likely never pay a cent.",
		},
		{
			emoji: "🛠️",
			title: "Make it yours",
			body: "Want to track something specific, or change how it looks? Just ask the agent in plain words. It's your Tama — it bends to your pet.",
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
					Studio is the friendly chat where you set Tama up and talk to it
					afterward. It's the same platform companies use to build real
					software — Tama is the cuddly, personal corner of it.
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
			a: "No. If you can make a free online account and answer questions about your pet, you're good. The agent does all the technical parts and explains anything it needs from you along the way.",
		},
		{
			q: "Is it really free?",
			a: "Yes — for one pet you'll almost certainly never pay anything. It runs on Cloudflare's free tier. No subscription, no monthly fee. (If you somehow outgrow it, you'd just add a card to Cloudflare — but that's rare.)",
		},
		{
			q: "How long does setup take?",
			a: "A few minutes. Most of it is just you answering questions about your pet and picking a photo. The agent handles the rest while you watch.",
		},
		{
			q: "Can I track more than one pet?",
			a: "Each pet gets its own Tama — so you'd set one up per pet. They stay completely separate, which keeps each one simple and personal. The agent can set up another one the same easy way.",
		},
		{
			q: "What if my pet's pixel face looks off?",
			a: "Just give it another photo and ask for a new one. You can re-do it as many times as you like until it feels like them.",
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
