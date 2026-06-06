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
			title: ["An agent for ", { mark: "your pet" }, " to live a better life."],
			sub: "A complete health record for your pet — every visit, vaccine, medicine, and lab result in one continuous timeline. And an AI that knows the whole history, so you (and your vet) can understand your pet holistically and decide together what's next.",
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
				", and a place to ",
				{ mark: "drop anything" },
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
					kicker: "Assets",
					title: "Drop in anything.",
					body: "Upload a PDF, a photo, a vaccine card, a voice memo. The agent reads it and files it into the timeline for you — as an exam with charted values, a visit, a vaccine, or a note.",
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
			title: "What's inside.",
			sub: "Nine things, one place — all working together because they're all about the same pet.",
			features: [
				{
					title: "One continuous timeline",
					body: "Every vet visit, vaccine, symptom, medicine, exam, and note in one chronological log. The whole story of your pet's life — so nothing about their health ever falls through the cracks.",
				},
				{
					title: "Medicine timetable",
					body: "A live schedule for every medicine and meal. Doses given early or late shift the schedule to keep the interval — no math, no missed doses.",
				},
				{
					title: "Assets — drop anything",
					body: "Upload any document, lab report, vaccine card, or recording. The agent reads it and files it into the timeline automatically — as an exam, a visit, a vaccine, or a note.",
				},
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
					title: "Pixel companion",
					body: "Add it to your home screen. A tiny pixel face of your pet that reacts to the schedule — sleeping at night, looking concerned when meds are late.",
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
					q: "What if my pet's pixel face looks off?",
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
			title: ["Um agente pro ", { mark: "seu pet" }, " viver melhor."],
			sub: "Um histórico de saúde completo do seu pet — cada consulta, vacina, remédio e exame numa única linha do tempo contínua. E uma IA que conhece toda a história, pra você (e o seu veterinário) entenderem o seu pet por inteiro e decidirem juntos o próximo passo.",
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
				", e um lugar pra ",
				{ mark: "jogar qualquer coisa" },
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
					kicker: "Documentos",
					title: "Jogue qualquer coisa.",
					body: "Suba um PDF, uma foto, uma carteira de vacinação, um áudio. O agente lê e arquiva na linha do tempo pra você — como exame com valores no gráfico, consulta, vacina ou anotação.",
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
			title: "O que tem dentro.",
			sub: "Nove coisas, um lugar só — funcionando juntas porque são todas sobre o mesmo pet.",
			features: [
				{
					title: "Uma linha do tempo contínua",
					body: "Cada consulta, vacina, sintoma, remédio, exame e anotação num só registro cronológico. A história inteira da vida do seu pet — pra que nada sobre a saúde dele passe batido.",
				},
				{
					title: "Agenda de remédios",
					body: "Uma agenda ao vivo de cada remédio e refeição. Doses dadas adiantadas ou atrasadas reajustam a agenda pra manter o intervalo — sem conta, sem dose perdida.",
				},
				{
					title: "Documentos — jogue qualquer coisa",
					body: "Suba qualquer documento, exame, carteira de vacina ou áudio. O agente lê e arquiva na linha do tempo automaticamente — como exame, consulta, vacina ou anotação.",
				},
				{
					title: "Gráficos de exames",
					body: "Os valores dos exames são extraídos e plotados ao longo do tempo, pra você e o veterinário verem a tendência — hemoglobina se recuperando, função renal estável — num olhar.",
				},
				{
					title: "Uma IA com quem o veterinário conversa",
					body: "Seu veterinário (ou uma segunda opinião) pode perguntar ao agente sobre o histórico completo do seu pet em linguagem natural, e colaborar no caso com o registro inteiro à frente.",
				},
				{
					title: "Lembretes no celular",
					body: "Quando uma dose está na hora, seu celular ou laptop vibra. Funciona pelo app na tela inicial no iOS e no Android.",
				},
				{
					title: "Pesquisa veterinária com fontes",
					body: "Pergunte sobre interações de medicamentos, efeitos colaterais ou o que esperar — as respostas são buscadas na literatura com os remédios e o histórico reais do seu pet anexados.",
				},
				{
					title: "Resumo de saúde vivo",
					body: "Um parágrafo que evolui — onde o seu pet está agora, o que está ativo, o que observar — regerado a partir da linha do tempo inteira sempre que você pedir.",
				},
				{
					title: "Companheiro pixelado",
					body: "Adicione à tela inicial. Um rostinho em pixel do seu pet que reage à agenda — dormindo de noite, preocupado quando o remédio atrasa.",
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
					body: "O agente faz algumas perguntas amigáveis — nome, raça, uma foto, as anotações do veterinário. Ele até desenha uma versão pixelada do seu pet a partir da foto.",
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
					q: "E se o rostinho em pixel do meu pet ficar estranho?",
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
