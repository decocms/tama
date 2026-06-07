// Landing Worker: serves the static build, but rewrites the document <title>
// and social/SEO meta per locale so /pt unfurls and indexes in Portuguese
// (crawlers don't run the client JS that swaps these at runtime). Everything
// non-HTML passes straight through from the ASSETS binding.

interface Env {
	ASSETS: Fetcher;
}

const META = {
	en: {
		lang: "en",
		locale: "en_US",
		title: "Tama — intelligence for your pet to live better",
		desc: "A complete health record for your pet — every visit, vaccine, medicine and lab result in one timeline, plus an AI that knows the whole history. Fork it, set it up for your pet, deploy to your own Cloudflare.",
		url: "https://tama.vet/en",
	},
	pt: {
		lang: "pt-BR",
		locale: "pt_BR",
		title: "Tama — inteligência pro seu pet viver melhor",
		desc: "Um histórico de saúde completo do seu pet — cada consulta, vacina, remédio e exame numa linha do tempo, e uma IA que conhece toda a história. Faça o fork, configure pro seu pet e faça deploy na sua própria Cloudflare.",
		url: "https://tama.vet/pt",
	},
} as const;

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);
		const res = await env.ASSETS.fetch(req);
		const ct = res.headers.get("content-type") ?? "";
		if (!ct.includes("text/html")) return res;

		const isPt = url.pathname.startsWith("/pt");
		const m = isPt ? META.pt : META.en;
		// Absolute image URL on whatever origin is serving us (tama-landing.…
		// .workers.dev today, tama.vet once the domain is live) so the social
		// crawler can always fetch it.
		const ogImage = `${url.origin}/og-${isPt ? "pt" : "en"}.png`;
		return new HTMLRewriter()
			.on("html", {
				element(e) {
					e.setAttribute("lang", m.lang);
				},
			})
			.on("title", {
				element(e) {
					e.setInnerContent(m.title);
				},
			})
			.on('meta[name="description"]', {
				element(e) {
					e.setAttribute("content", m.desc);
				},
			})
			.on('meta[property="og:title"]', {
				element(e) {
					e.setAttribute("content", m.title);
				},
			})
			.on('meta[property="og:description"]', {
				element(e) {
					e.setAttribute("content", m.desc);
				},
			})
			.on('meta[property="og:url"]', {
				element(e) {
					e.setAttribute("content", m.url);
				},
			})
			.on('meta[property="og:image"]', {
				element(e) {
					e.setAttribute("content", ogImage);
				},
			})
			.on('meta[name="twitter:image"]', {
				element(e) {
					e.setAttribute("content", ogImage);
				},
			})
			.on('meta[name="twitter:title"]', {
				element(e) {
					e.setAttribute("content", m.title);
				},
			})
			.on('meta[name="twitter:description"]', {
				element(e) {
					e.setAttribute("content", m.desc);
				},
			})
			.on('meta[property="og:locale"]', {
				element(e) {
					e.setAttribute("content", m.locale);
				},
			})
			.on('link[rel="canonical"]', {
				element(e) {
					e.setAttribute("href", m.url);
				},
			})
			.transform(res);
	},
};
