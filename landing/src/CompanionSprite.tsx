import { useEffect, useState } from "react";
import { PIXEL_SPRITES } from "./pixel-sprites.ts";

// Cycles Pixel's six SVG companion states (rendered by the app's procedural
// renderer, baked into pixel-sprites.ts). Fills its parent, so the caller
// controls the size; a gentle breathe animation lives on `.sprite` in the CSS.
export function CompanionSprite({ className }: { className?: string }) {
	const [i, setI] = useState(0);
	useEffect(() => {
		// Linger on idle, then step through the moods.
		const id = setInterval(() => {
			setI((p) => (p + 1) % PIXEL_SPRITES.length);
		}, 2300);
		return () => clearInterval(id);
	}, []);
	return (
		<div
			className={`sprite w-full h-full [&>svg]:w-full [&>svg]:h-full ${className ?? ""}`}
			aria-hidden
			// biome-ignore lint/security/noDangerouslySetInnerHtml: our own renderer output
			dangerouslySetInnerHTML={{ __html: PIXEL_SPRITES[i] }}
		/>
	);
}
