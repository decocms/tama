import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CONTENT, detectLang, type Lang } from "./content.ts";
import { Landing } from "./Landing.tsx";
import "./index.css";

// Locale routing, client-side (the worker serves index.html for any path via
// not_found_handling = single-page-application):
//   /pt        → Portuguese
//   /en        → English
//   / (or any) → detect from the browser's languages, then replace the URL
//                with /pt or /en so the choice is shareable and bookmarkable.
const path = window.location.pathname;
let lang: Lang;
if (path === "/pt" || path.startsWith("/pt/")) {
	lang = "pt";
} else if (path === "/en" || path.startsWith("/en/")) {
	lang = "en";
} else {
	lang = detectLang(navigator.languages ?? [navigator.language]);
	window.history.replaceState(null, "", `/${lang}`);
}

const c = CONTENT[lang];

// Reflect the locale in the document for a11y + SEO, and localize the tab.
document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
document.title =
	lang === "pt"
		? "Tama — um agente pro seu pet viver melhor"
		: "Tama — an agent for your pet to live a better life";
const metaDesc = document.querySelector('meta[name="description"]');
if (metaDesc) metaDesc.setAttribute("content", c.hero.sub);

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<Landing c={c} lang={lang} />
	</StrictMode>,
);
