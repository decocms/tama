// All landing copy, in both languages. The structure (emojis, colors, layout)
// lives in Landing.tsx; only the words live here. `Landing` renders from one
// of these by locale. Headlines that mix plain + highlighted text are stored
// as Segment arrays so the highlighter pen can wrap individual words.

export type Lang = "en" | "pt";

// A headline piece: a plain string, or a { mark } that gets the highlighter.
export type Segment = string | { mark: string };

export interface Card {
	title: string;
	body: string;
}
export interface KickerCard extends Card {
	kicker: string;
}
export interface Step extends Card {
	n: string;
}
export interface QA {
	q: string;
	a: string;
}

export interface LandingContent {
	nav: { demo: string; github: string; cta: string; switchTo: string };
	hero: {
		badge: string;
		title: Segment[];
		sub: string;
		ctaPrimary: string;
		ctaSecondary: string;
		footnote: string;
		petTag: string;
	};
	concepts: {
		kicker: string;
		title: Segment[];
		sub: string;
		cards: KickerCard[]; // 3
	};
	twoPaths: {
		kicker: string;
		title: Segment[];
		dev: Card;
		nonDev: Card;
		footer: string;
	};
	whatsInside: { title: string; sub: string; features: Card[] }; // 9
	howItWorks: { title: string; sub: string; steps: Step[] }; // 4
	liveDemo: { title: string; sub: string; cta: string; caption: string };
	privacy: { title: string; sub: string; items: Card[] }; // 3
	studio: { kicker: string; title: string; body: string; cta: string };
	faq: { title: string; items: QA[] }; // 5
	footer: { tagline: string; github: string; studio: string; license: string };
}

export const CONTENT: Record<Lang, LandingContent> = {
	en: {
		nav: { demo: "Demo", github: "GitHub", cta: "Create yours →", switchTo: "PT" },
		hero: {
			badge: "Free · Private · Set up in minutes",
			title: ["Intelligence for ", { mark: "your pet" }, " to live better."],
			sub: "Create an AI agent that looks after your pet alongside you. It keeps and actually understands their whole health history — every visit, vaccine, medicine, and lab result — and becomes a copilot that helps you and your vet catch problems early and treat with more precision.",
			ctaPrimary: "Create your pet's agent, free →",
			ctaSecondary: "See the live demo",
			footnote: "Free forever · Your data lives in your own Cloudflare account",
			petTag: "Pixel, Chihuahua, 6 yrs",
		},
		concepts: {
			kicker: "Three simple ideas",
			title: [
				"A ",
				{ mark: "timeline" },
				", a ",
				{ mark: "timetable" },
				", and your ",
				{ mark: "exams & visits" },
				".",
			],
			sub: "That's the whole product. Everything else — the graphs, the reminders, the AI your vet can talk to — grows out of these three.",
			cards: [
				{
					kicker: "Timeline",
					title: "The whole story, one log.",
					body: "Every vet visit, vaccine, symptom, medicine given, and lab result — in one continuous, chronological record. Nothing siloed, nothing lost. The agent always has the full history when you or your vet ask.",
				},
				{
					kicker: "Timetable",
					title: "Medicines, organized.",
					body: "A live schedule of every medicine and meal, with reminders that buzz your phone. Give a dose early or late and the schedule shifts to keep the interval — no math, no missed doses.",
				},
				{
					kicker: "Exams & visits",
					title: "Send it all, keep the context.",
					body: "Upload exam PDFs and voice recordings of your vet visits. The agent reads them, turns the lab values into charts, and keeps the whole context on the timeline — nothing lost from one visit to the next.",
				},
			],
		},
		twoPaths: {
			kicker: "Two ways in",
			title: ["Set it up ", { mark: "your" }, " way."],
			dev: {
				title: "You write code",
				body: "Fork the repo and vibecode it with Claude. There's an AGENTS.md that tells your agent exactly what to do — set it up for your pet, then deploy to your own Cloudflare. You're in your terminal, you know the drill.",
			},
			nonDev: {
				title: "You don't? No problem",
				body: "Use deco studio. Paste the Tama link and the agent walks you through everything — even making your GitHub and Cloudflare accounts, setting up your pet, and going live. No terminal, no code, no stress.",
			},
			footer: "Either way, you bring the pet — Tama brings everything else.",
		},
		whatsInside: {
			title: "And then some.",
			sub: "More that comes built in — all pulling in the same direction, because it's all about the same pet.",
			features: [
				{
					title: "Lab exam graphs",
					body: "Lab values are extracted and charted over time, so you and your vet can see a trend — hemoglobin recovering, kidney values holding — at a glance.",
				},
				{
					title: "An AI your vet can talk to",
					body: "Your vet (or a second opinion) can ask the agent about your pet's full history in plain language, and collaborate on the case with the complete record in front of them.",
				},
				{
					title: "Push reminders",
					body: "When a dose is due, your phone or laptop buzzes. Works from the home-screen app on iOS + Android.",
				},
				{
					title: "Grounded vet research",
					body: "Ask about drug interactions, side effects, or what to expect — answers are searched against the literature with your pet's actual meds and history attached.",
				},
				{
					title: "Living health summary",
					body: "One evolving paragraph — where your pet stands right now, what's active, what to watch — regenerated from the whole timeline whenever you ask.",
				},
				{
					title: "A companion on your home screen",
					body: "A little face of your pet, drawn from its photo, that reacts to the schedule — asleep at night, a worried look when meds run late.",
				},
			],
		},
		howItWorks: {
			title: "How it works.",
			sub: "Four steps, mostly just answering questions. The agent does everything technical for you.",
			steps: [
				{
					n: "01",
					title: "Open it",
					body: "Go to deco studio and point it at Tama. One click — no downloads, nothing to install.",
				},
				{
					n: "02",
					title: "Introduce your pet",
					body: "The agent asks a few friendly questions — name, breed, a photo, your vet's notes. It even draws a little cartoon version of them from the photo.",
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
			],
		},
		liveDemo: {
			title: "A real, working Tama.",
			sub: "The demo is seeded with a real example pet — Pixel, recovering from anemia. Scroll the timeline, watch the hemoglobin trend climb, check the medicine timetable, see the companion react. No signup.",
			cta: "Open the demo →",
			caption: "tama-example.workers.dev",
		},
		privacy: {
			title: "Your pet, your deploy.",
			sub: "Medical history is sensitive. We thought hard about where it lives. The answer was easy: not with us.",
			items: [
				{
					title: "Your data, your account",
					body: "Everything — exams, photos, your pet's whole history — lives in your own free Cloudflare account. We never see a single byte of it.",
				},
				{
					title: "Free forever",
					body: "Cloudflare's free tier covers one pet easily. No subscription, no monthly fee, no surprise bills. You'll likely never pay a cent.",
				},
				{
					title: "Make it yours",
					body: "Want to track something specific, or change how it looks? Just ask the agent in plain words. It's your Tama — it bends to your pet.",
				},
			],
		},
		studio: {
			kicker: "Powered by",
			title: "Built on deco studio.",
			body: "Studio is the friendly chat where you set Tama up and talk to it afterward. It's the same platform companies use to build real software — Tama is the cuddly, personal corner of it.",
			cta: "studio.decocms.com →",
		},
		faq: {
			title: "Questions.",
			items: [
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
					q: "What if my pet's face looks off?",
					a: "Just give it another photo and ask for a new one. You can re-do it as many times as you like until it feels like them.",
				},
			],
		},
		footer: {
			tagline: "Built for the one creature that matters.",
			github: "GitHub",
			studio: "Studio",
			license: "MIT",
		},
	},

	pt: {
		nav: { demo: "Demo", github: "GitHub", cta: "Crie o seu →", switchTo: "EN" },
		hero: {
			badge: "Grátis · Privado · Pronto em minutos",
			title: ["Inteligência pro ", { mark: "seu pet" }, " viver melhor."],
			sub: "Crie um agente de IA que cuida do seu pet junto com você. Ele guarda e realmente entende todo o histórico de saúde — cada consulta, vacina, remédio e exame — e vira um copiloto que ajuda você e o veterinário a prevenir problemas antes e tratar com mais precisão.",
			ctaPrimary: "Crie o agente do seu pet, grátis →",
			ctaSecondary: "Ver a demo ao vivo",
			footnote: "Grátis pra sempre · Seus dados ficam na sua própria conta Cloudflare",
			petTag: "Pixel, Chihuahua, 6 anos",
		},
		concepts: {
			kicker: "Três ideias simples",
			title: [
				"Uma ",
				{ mark: "linha do tempo" },
				", uma ",
				{ mark: "agenda de remédios" },
				", e os ",
				{ mark: "exames e consultas" },
				".",
			],
			sub: "É o produto inteiro. Todo o resto — os gráficos, os lembretes, a IA com quem o seu veterinário conversa — nasce dessas três coisas.",
			cards: [
				{
					kicker: "Linha do tempo",
					title: "A história inteira, um só registro.",
					body: "Cada consulta, vacina, sintoma, remédio dado e resultado de exame — num único registro cronológico. Nada espalhado, nada perdido. O agente sempre tem o histórico completo quando você ou o veterinário perguntam.",
				},
				{
					kicker: "Agenda",
					title: "Remédios, organizados.",
					body: "Uma agenda ao vivo de cada remédio e refeição, com lembretes que avisam no seu celular. Deu uma dose adiantada ou atrasada e a agenda se ajusta pra manter o intervalo — sem conta de cabeça, sem dose esquecida.",
				},
				{
					kicker: "Exames & consultas",
					title: "Mande tudo, guarde o contexto.",
					body: "Envie PDFs de exames e áudios das consultas. O agente lê, transforma os valores em gráficos e guarda o contexto inteiro na linha do tempo — nada se perde de uma visita pra outra.",
				},
			],
		},
		twoPaths: {
			kicker: "Dois caminhos",
			title: ["Configure do ", { mark: "seu" }, " jeito."],
			dev: {
				title: "Você programa",
				body: "Faça um fork do repositório e vibecode com o Claude. Tem um AGENTS.md que diz exatamente o que o seu agente deve fazer — configurar pro seu pet e fazer deploy na sua própria Cloudflare. Você tá no terminal, já manja.",
			},
			nonDev: {
				title: "Não programa? Sem problema",
				body: "Use o deco studio. Cole o link do Tama e o agente te guia em tudo — até criar suas contas no GitHub e na Cloudflare, configurar o seu pet e colocar no ar. Sem terminal, sem código, sem estresse.",
			},
			footer: "De qualquer jeito, você traz o pet — o Tama traz o resto.",
		},
		whatsInside: {
			title: "E ainda mais.",
			sub: "O que já vem junto — tudo puxando pro mesmo lugar, porque é tudo sobre o mesmo pet.",
			features: [
				{
					title: "Gráficos de exames",
					body: "Os valores dos exames são extraídos e viram gráfico ao longo do tempo, pra você e o veterinário verem a tendência — a hemoglobina se recuperando, a função renal estável — num relance.",
				},
				{
					title: "Uma IA com quem o veterinário conversa",
					body: "Seu veterinário (ou uma segunda opinião) pode perguntar ao agente sobre o histórico completo do seu pet em linguagem natural, e cuidar do caso com o registro inteiro à frente.",
				},
				{
					title: "Lembretes no celular",
					body: "Quando chega a hora de uma dose, seu celular vibra. Funciona pelo app na tela inicial, no iOS e no Android.",
				},
				{
					title: "Pesquisa veterinária com fontes",
					body: "Pergunte sobre interações de medicamentos, efeitos colaterais ou o que esperar — as respostas vêm da literatura, com os remédios e o histórico reais do seu pet já anexados.",
				},
				{
					title: "Resumo de saúde que evolui",
					body: "Um parágrafo vivo — como o seu pet está agora, o que está em aberto, o que observar — refeito a partir da linha do tempo inteira sempre que você pedir.",
				},
				{
					title: "Um companheiro na tela inicial",
					body: "Um rostinho do seu pet, desenhado a partir da foto, que reage à rotina — dormindo de noite, com carinha de preocupado quando o remédio atrasa.",
				},
			],
		},
		howItWorks: {
			title: "Como funciona.",
			sub: "Quatro passos, quase só respondendo perguntas. O agente faz tudo que é técnico por você.",
			steps: [
				{
					n: "01",
					title: "Abra",
					body: "Vá no deco studio e aponte pro Tama. Um clique — nada pra baixar, nada pra instalar.",
				},
				{
					n: "02",
					title: "Apresente o seu pet",
					body: "O agente faz algumas perguntas amigáveis — nome, raça, uma foto, as anotações do veterinário. Ele até desenha uma versão do seu pet a partir da foto.",
				},
				{
					n: "03",
					title: "Coloque no ar",
					body: "Conecte uma conta grátis da Cloudflare quando ele pedir. O agente cuida de toda a configuração e te entrega o link da página do seu pet.",
				},
				{
					n: "04",
					title: "Use todo dia",
					body: "Adicione à tela inicial do celular. A partir daí, é só conversar — suba um exame, registre um remédio, faça uma pergunta.",
				},
			],
		},
		liveDemo: {
			title: "Um Tama real, funcionando.",
			sub: "A demo vem com um pet de exemplo real — o Pixel, se recuperando de anemia. Role a linha do tempo, veja a tendência da hemoglobina subir, confira a agenda de remédios, veja o companheiro reagir. Sem cadastro.",
			cta: "Abrir a demo →",
			caption: "tama-example.workers.dev",
		},
		privacy: {
			title: "Seu pet, seu deploy.",
			sub: "Histórico médico é sensível. Pensamos bastante em onde ele fica. A resposta foi fácil: não com a gente.",
			items: [
				{
					title: "Seus dados, sua conta",
					body: "Tudo — exames, fotos, o histórico inteiro do seu pet — fica na sua própria conta grátis da Cloudflare. A gente nunca vê um byte sequer.",
				},
				{
					title: "Grátis pra sempre",
					body: "O plano grátis da Cloudflare cobre um pet de sobra. Sem assinatura, sem mensalidade, sem susto na fatura. Você provavelmente nunca vai pagar nada.",
				},
				{
					title: "Faça do seu jeito",
					body: "Quer acompanhar algo específico, ou mudar a aparência? É só pedir pro agente em palavras simples. O Tama é seu — ele se molda ao seu pet.",
				},
			],
		},
		studio: {
			kicker: "Feito com",
			title: "Feito no deco studio.",
			body: "O studio é o chat amigável onde você configura o Tama e conversa com ele depois. É a mesma plataforma que empresas usam pra construir software de verdade — o Tama é o cantinho fofo e pessoal dela.",
			cta: "studio.decocms.com →",
		},
		faq: {
			title: "Perguntas.",
			items: [
				{
					q: "Preciso ser programador?",
					a: "Não. Se você consegue criar uma conta grátis na internet e responder perguntas sobre o seu pet, tá pronto. O agente faz toda a parte técnica e explica o que precisar de você no caminho.",
				},
				{
					q: "É grátis mesmo?",
					a: "Sim — pra um pet você quase certamente nunca vai pagar nada. Roda no plano grátis da Cloudflare. Sem assinatura, sem mensalidade. (Se um dia passar do limite, é só adicionar um cartão na Cloudflare — mas isso é raro.)",
				},
				{
					q: "Quanto tempo leva pra configurar?",
					a: "Alguns minutos. A maior parte é só você respondendo perguntas sobre o seu pet e escolhendo uma foto. O agente cuida do resto enquanto você assiste.",
				},
				{
					q: "Dá pra acompanhar mais de um pet?",
					a: "Cada pet ganha o seu próprio Tama — então você configura um por pet. Eles ficam totalmente separados, o que mantém cada um simples e pessoal. O agente configura outro do mesmo jeito fácil.",
				},
				{
					q: "E se o rostinho do meu pet ficar estranho?",
					a: "É só mandar outra foto e pedir um novo. Pode refazer quantas vezes quiser até ficar com a cara dele.",
				},
			],
		},
		footer: {
			tagline: "Feito pra aquela criatura que importa.",
			github: "GitHub",
			studio: "Studio",
			license: "MIT",
		},
	},
};

// Pick the best locale for a visitor from their browser languages.
export function detectLang(languages: readonly string[]): Lang {
	for (const l of languages) {
		if (l.toLowerCase().startsWith("pt")) return "pt";
		if (l.toLowerCase().startsWith("en")) return "en";
	}
	return "en";
}
