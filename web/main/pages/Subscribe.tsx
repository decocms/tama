// Standalone landing page for enabling push reminders.
//
// Why it exists: MyVet's main UI runs inside a cross-origin iframe in deco
// studio, where browsers refuse to grant notification permission (iOS Safari
// blocks outright; Chrome requires permissions-policy on the iframe). iOS
// additionally needs the app to be Added-to-Home-Screen before Web Push
// works at all — and you can't install an iframe. This page lives at the
// raw worker origin so it can request permission directly and act as the
// install target for iOS users.
//
// After subscribing, we hand the user back to studio.decocms.com — the
// real surface they use day-to-day. The push subscription is stored
// server-side, keyed by the browser's push endpoint, so it keeps firing
// regardless of which surface (studio iframe vs. PWA) they use later.

import {
	Bell,
	BellRing,
	CheckCircle2,
	Copy,
	ExternalLink,
	Loader2,
	Share,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	getExistingSubscription,
	isIOS,
	isIOSSafari,
	isPushSupported,
	isStandalone,
	notificationPermission,
	subscribeStandalone,
} from "../lib/push.ts";

// The deco studio host where the embedded MyVet runs day-to-day. Once the
// user is subscribed on this device, they can return there for everything
// else — push delivery is independent of which surface is open.
const STUDIO_URL = "https://studio.decocms.com";

type Phase =
	| "loading" // checking existing subscription state
	| "needs-safari" // iOS but not Safari (Chrome/Firefox/in-app browser)
	| "needs-install" // iOS Safari, not yet added to home screen
	| "needs-permission" // ready to ask the browser
	| "blocked" // user previously denied notifications
	| "subscribing" // in-flight
	| "subscribed" // we have a push subscription
	| "unsupported" // browser has no Push API at all
	| "error";

export function SubscribePage() {
	const [phase, setPhase] = useState<Phase>("loading");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		// iOS gotchas, in order:
		//  1. Non-Safari iOS browser (Chrome, Firefox, in-app WKWebViews) — has
		//     the Notification API surface but requestPermission() silently
		//     returns "denied". We can't prompt; user must open in Safari.
		//  2. iOS Safari but not yet installed to home screen — Notification API
		//     is hidden entirely so isPushSupported() would lie. User must Add
		//     to Home Screen first, then launch from there.
		// Both check before isPushSupported() so iPhones get the right hint.
		if (isIOS() && !isIOSSafari()) {
			setPhase("needs-safari");
			return;
		}
		if (isIOS() && !isStandalone()) {
			setPhase("needs-install");
			return;
		}
		if (!isPushSupported()) {
			setPhase("unsupported");
			return;
		}
		getExistingSubscription().then((sub) => {
			if (sub) {
				setPhase("subscribed");
				return;
			}
			const perm = notificationPermission();
			setPhase(perm === "denied" ? "blocked" : "needs-permission");
		});
	}, []);

	const handleEnable = async () => {
		setPhase("subscribing");
		setError(null);
		try {
			await subscribeStandalone({});
			setPhase("subscribed");
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			// If denial brought us here, drop into the blocked state so the UI
			// surfaces "change browser settings" guidance.
			setPhase(notificationPermission() === "denied" ? "blocked" : "error");
		}
	};

	// Subscribed is the steady state — this is what the user sees every time
	// they tap the home-screen icon. Render a launcher-style layout (big logo,
	// huge primary CTA to studio) instead of a setup-y card. Other phases stay
	// in the original setup card layout.
	if (phase === "subscribed") return <LauncherView />;

	return (
		<div className="min-h-screen bg-background text-foreground flex items-start justify-center pt-12 pb-24 px-4">
			<div className="w-full max-w-md space-y-6">
				<header className="text-center space-y-2">
					<div className="mx-auto w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
						<BellRing className="w-8 h-8" />
					</div>
					<h1 className="font-display text-2xl font-semibold">
						MyVet reminders
					</h1>
					<p className="text-sm text-muted-foreground">
						Push notifications ~10 minutes before each scheduled dose.
					</p>
				</header>

				<div className="rounded-2xl border bg-card p-5 space-y-4">
					{phase === "loading" ? <LoadingState /> : null}
					{phase === "unsupported" ? <UnsupportedState /> : null}
					{phase === "needs-safari" ? <NeedsSafariState /> : null}
					{phase === "needs-install" ? <NeedsInstallState /> : null}
					{phase === "needs-permission" ? (
						<NeedsPermissionState onEnable={handleEnable} />
					) : null}
					{phase === "subscribing" ? <SubscribingState /> : null}
					{phase === "blocked" ? <BlockedState /> : null}
					{phase === "error" ? (
						<ErrorState message={error} onRetry={handleEnable} />
					) : null}
				</div>

				<p className="text-center text-xs text-muted-foreground">
					You can manage notifications later from the timetable in deco studio.
				</p>
			</div>
		</div>
	);
}

// Launcher view: the steady-state PWA home screen after the user has
// subscribed. Single huge CTA into studio (external Safari for session) +
// a small reminders-on badge. No "subscribe" framing — this screen is the
// MyVet launcher, not a setup wizard.
//
// iOS PWA caveat: WebKit may route the studio link through SFSafariViewController
// or its own WKWebView instead of the real Safari app. Both have a different
// localStorage jar from Safari, so the user appears logged out. There is no
// JS-level "open in Safari.app" call on iOS — Apple doesn't expose one. So we
// pair the Open button with a Copy-link button as a guaranteed fallback.
function LauncherView() {
	const copyStudioUrl = async () => {
		try {
			await navigator.clipboard.writeText(STUDIO_URL);
			toast.success("Link copied — paste into Safari");
		} catch {
			toast.error("Couldn't copy. URL: studio.decocms.com");
		}
	};
	return (
		<div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-between pt-16 pb-12 px-6">
			<div className="flex-1 flex flex-col items-center justify-center w-full max-w-md text-center space-y-5">
				<div className="w-24 h-24 rounded-3xl bg-secondary flex items-center justify-center">
					<BellRing className="w-12 h-12" />
				</div>
				<div className="space-y-1.5">
					<h1 className="font-display text-3xl font-semibold">MyVet</h1>
					<p className="text-sm text-muted-foreground">
						Open the app in deco studio.
					</p>
				</div>
				<a
					href={STUDIO_URL}
					target="_blank"
					rel="noopener noreferrer external"
					className="block w-full"
				>
					<Button size="lg" className="w-full h-14 text-base font-semibold">
						Open MyVet
						<ExternalLink className="w-4 h-4" />
					</Button>
				</a>
				<Button
					variant="outline"
					size="lg"
					className="w-full h-12"
					onClick={copyStudioUrl}
				>
					<Copy className="w-4 h-4" />
					Copy link to paste in Safari
				</Button>
				<p className="text-[11px] text-muted-foreground leading-relaxed max-w-[280px]">
					iOS may open the link in an in-app browser without your login. If
					that happens, use <strong>Copy link</strong> and paste it into Safari
					— or long-press the button and choose <strong>Open in Safari</strong>.
				</p>
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-status-given)]" />
					Reminders are on for this device
				</div>
			</div>
			<p className="text-center text-[11px] text-muted-foreground max-w-xs">
				This home-screen icon keeps push notifications working. The full app
				lives in deco studio.
			</p>
		</div>
	);
}

// ---------------------------------------------------------------------------

function LoadingState() {
	return (
		<div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
			<Loader2 className="w-4 h-4 animate-spin mr-2" />
			Checking…
		</div>
	);
}

function UnsupportedState() {
	return (
		<div className="space-y-2 text-sm">
			<p className="font-semibold">This browser doesn't support push.</p>
			<p className="text-muted-foreground">
				Try a recent version of Chrome, Edge, Firefox, or Safari (iOS 16.4+).
			</p>
			<OpenStudioButton />
		</div>
	);
}

function NeedsSafariState() {
	const copyUrl = async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			toast.success("Link copied — paste into Safari");
		} catch {
			toast.error("Couldn't copy. Long-press the URL bar instead.");
		}
	};
	return (
		<div className="space-y-3 text-sm">
			<div>
				<p className="font-semibold">Open this page in Safari</p>
				<p className="text-muted-foreground mt-1">
					On iPhone, Web Push only works in <strong>Safari</strong>. Chrome,
					Firefox, and in-app browsers can show this page but Apple won't let
					them request notification permission.
				</p>
			</div>
			<ol className="space-y-1 text-muted-foreground list-decimal pl-5">
				<li>Copy this page's URL.</li>
				<li>Open the Safari app.</li>
				<li>Paste and load the URL.</li>
				<li>Then tap Share → Add to Home Screen.</li>
			</ol>
			<Button onClick={copyUrl} className="w-full">
				<Copy className="w-4 h-4" />
				Copy URL
			</Button>
			<Badge variant="outline" className="text-[10px]">
				iOS 16.4+ Safari required
			</Badge>
		</div>
	);
}

function NeedsInstallState() {
	return (
		<div className="space-y-3 text-sm">
			<div className="flex items-start gap-2">
				<Share className="w-4 h-4 mt-0.5 shrink-0" />
				<div>
					<p className="font-semibold">Install MyVet first</p>
					<p className="text-muted-foreground mt-1">
						iPhone/iPad only delivers push notifications to home-screen apps. In
						Safari, tap the <strong>Share</strong> button, then choose{" "}
						<strong>Add to Home Screen</strong>. Open MyVet from your home
						screen and you'll come back to this page.
					</p>
				</div>
			</div>
			<Badge variant="outline" className="text-[10px]">
				iOS 16.4+ required
			</Badge>
		</div>
	);
}

function NeedsPermissionState({ onEnable }: { onEnable: () => void }) {
	return (
		<div className="space-y-3 text-sm">
			<ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
				<li>Reminder fires 10–20 min before each scheduled dose.</li>
				<li>Tap the notification to jump to logging it.</li>
				<li>Turn off any time from the timetable header in deco studio.</li>
			</ul>
			<Button onClick={onEnable} className="w-full">
				<Bell className="w-4 h-4" />
				Allow notifications
			</Button>
		</div>
	);
}

function SubscribingState() {
	return (
		<div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
			<Loader2 className="w-4 h-4 animate-spin mr-2" />
			Subscribing…
		</div>
	);
}

function BlockedState() {
	return (
		<div className="space-y-3 text-sm">
			<p className="font-semibold">Notifications are blocked</p>
			<p className="text-muted-foreground">
				Open this site's notification settings in your browser, change it to{" "}
				<strong>Allow</strong>, then reload this page.
			</p>
			<OpenStudioButton />
		</div>
	);
}

function ErrorState({
	message,
	onRetry,
}: {
	message: string | null;
	onRetry: () => void;
}) {
	return (
		<div className="space-y-3 text-sm">
			<p className="font-semibold">Couldn't subscribe</p>
			<p className="text-muted-foreground">
				{message ?? "Something went wrong."}
			</p>
			<div className="flex gap-2">
				<Button onClick={onRetry} variant="outline" className="flex-1">
					Try again
				</Button>
				<OpenStudioButton variant="ghost" />
			</div>
		</div>
	);
}

function OpenStudioButton({
	variant = "default",
}: {
	variant?: "default" | "outline" | "ghost";
}) {
	// target="_blank" + rel="noopener" bounces out of the iOS PWA WebView
	// into external Safari, where the user's studio.decocms.com session
	// already exists. Without this, the link opens inside the PWA's own
	// WebView, which has a separate cookie jar and would log them out.
	return (
		<a
			href={STUDIO_URL}
			target="_blank"
			rel="noopener noreferrer"
			className="block"
		>
			<Button variant={variant} className="w-full">
				Open MyVet in deco studio
				<ExternalLink className="w-3.5 h-3.5" />
			</Button>
		</a>
	);
}
