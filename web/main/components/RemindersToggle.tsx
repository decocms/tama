import {
	Bell,
	BellOff,
	BellRing,
	ExternalLink,
	Loader2,
	Share,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
	isInIframe,
	isIOS,
	isPushSupported,
	isStandalone,
	notificationPermission,
} from "../lib/push.ts";
import {
	usePushSubscription,
	useSendTestPush,
	useSubscribeToPush,
	useUnsubscribeFromPush,
} from "../lib/queries.ts";

interface Props {
	petId?: string;
}

// Deco studio proxies the Tama bundle into an iframe on its own origin
// (studio.decocms.com), so `window.location.origin` from inside the iframe
// is studio's domain — not our worker. We hardcode the worker origin so the
// /subscribe popup actually loads the Tama page rather than a studio route.
//
// THE ADOPT FLOW REPLACES THIS — see AGENTS.md step 1 ("CUSTOMIZE"). After
// deploy, set it to the real worker URL (something like
// "https://tama-<petslug>.workers.dev"). The placeholder below points at
// the public example demo and is harmless until the real adopt runs.
const WORKER_ORIGIN = "https://tama-example.deco-ceo.workers.dev";

// Two render paths, split into separate components so neither leaks hook
// requirements to the other:
//
//   • IframeButton (RemindersToggle when isInIframe) — a thin deep-link to
//     the standalone /subscribe page at the worker origin. CRITICAL: this
//     path must not call isPushSupported() or registerServiceWorker(),
//     because iOS Safari hides the Notification API from iframes (so the
//     gate would return false and the button would disappear — which is
//     exactly what was happening on iPhone inside studio).
//
//   • StandaloneToggle — full inline subscribe/unsubscribe/test flow, used
//     when the page is loaded directly (PWA, direct worker URL).
//
// Subscription state is intentionally not inspected from inside the iframe:
// the SW + subscription live at the worker origin, and the iframe runs at
// studio's origin, so the iframe genuinely can't see them. We always show
// "Set up reminders" inside the iframe; the popup itself reports back the
// real state.
export function RemindersToggle({ petId }: Props) {
	// useMemo with empty deps → stable across renders, hook order safe.
	const inIframe = useMemo(() => isInIframe(), []);
	if (inIframe) return <IframeRemindersButton />;
	return <StandaloneRemindersToggle petId={petId} />;
}

function IframeRemindersButton() {
	const openStandalone = () => {
		// Always open the worker origin, not window.location.origin — studio
		// embeds us in a frame at studio.decocms.com, so `origin` would resolve
		// the hash route against studio.
		window.open(
			`${WORKER_ORIGIN}/#/subscribe`,
			"_blank",
			"noopener,noreferrer",
		);
	};
	return (
		<Button
			size="sm"
			variant="ghost"
			onClick={openStandalone}
			className="text-xs"
			aria-label="Set up reminders"
			title="Set up reminders"
		>
			<Bell className="w-3.5 h-3.5" />
			{/* Section header doubles up with the History button — on narrow
			    phone viewports the labels would overflow and clip out of
			    sight. Hide labels below sm to keep both buttons visible. */}
			<span className="hidden sm:inline">Set up reminders</span>
			<ExternalLink className="w-3 h-3 opacity-60" />
		</Button>
	);
}

function StandaloneRemindersToggle({ petId }: Props) {
	const [open, setOpen] = useState(false);
	const [permission, setPermission] = useState<NotificationPermission>(() =>
		notificationPermission(),
	);
	const supported = isPushSupported();
	const onIos = useMemo(() => isIOS(), []);
	const standalone = useMemo(() => isStandalone(), []);

	const { data: sub } = usePushSubscription();
	const subscribe = useSubscribeToPush();
	const unsubscribe = useUnsubscribeFromPush();
	const test = useSendTestPush();

	// Notification.permission isn't reactive; re-read when the dialog opens
	// (covers the case where the user just changed it in browser settings).
	useEffect(() => {
		if (open) setPermission(notificationPermission());
	}, [open]);

	if (!supported) return null;

	const subscribed = sub?.subscribed === true;
	const iosNeedsInstall = onIos && !standalone;

	if (!subscribed) {
		return (
			<>
				<Button
					size="sm"
					variant="ghost"
					onClick={() => setOpen(true)}
					className="text-xs"
					aria-label="Enable reminders"
					title="Enable reminders"
				>
					<Bell className="w-3.5 h-3.5" />
					<span className="hidden sm:inline">Enable reminders</span>
				</Button>
				<EnableDialog
					open={open}
					onOpenChange={setOpen}
					iosNeedsInstall={iosNeedsInstall}
					permission={permission}
					isPending={subscribe.isPending}
					onEnable={() => {
						subscribe.mutate(
							undefined,
							{
								onSuccess: () => {
									toast.success("Reminders enabled");
									setOpen(false);
								},
								onError: (err) => toast.error((err as Error).message),
							},
						);
					}}
				/>
			</>
		);
	}

	return (
		<>
			<Button
				size="sm"
				variant="ghost"
				onClick={() => setOpen(true)}
				className="text-xs"
				aria-label="Reminders on — manage"
				title="Reminders on — tap to manage"
			>
				<BellRing className="w-3.5 h-3.5 text-[var(--color-status-given)]" />
				<span className="hidden sm:inline">Reminders on</span>
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle className="font-display flex items-center gap-2">
							<BellRing className="w-4 h-4 text-[var(--color-status-given)]" />
							Reminders on
						</DialogTitle>
						<DialogDescription>
							This browser will get a push notification ~10 min before each
							dose.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2 text-sm">
						<p className="text-muted-foreground">
							Send a test now to confirm the connection works.
						</p>
						<div className="flex gap-2">
							<Button
								size="sm"
								variant="outline"
								onClick={() =>
									test.mutate(undefined, {
										onSuccess: (r) =>
											toast.success(
												r.sent > 0
													? `Test sent to ${r.sent} device${r.sent === 1 ? "" : "s"}`
													: r.errors > 0
														? `Test failed (${r.errors} error${r.errors === 1 ? "" : "s"})`
														: "No active subscriptions",
											),
										onError: (err) => toast.error((err as Error).message),
									})
								}
								disabled={test.isPending}
							>
								{test.isPending ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<Bell className="w-3.5 h-3.5" />
								)}
								Send test
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={() =>
									unsubscribe.mutate(undefined, {
										onSuccess: () => {
											toast.success("Reminders turned off");
											setOpen(false);
										},
										onError: (err) => toast.error((err as Error).message),
									})
								}
								disabled={unsubscribe.isPending}
							>
								<BellOff className="w-3.5 h-3.5" />
								Turn off
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

function EnableDialog({
	open,
	onOpenChange,
	iosNeedsInstall,
	permission,
	isPending,
	onEnable,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	iosNeedsInstall: boolean;
	permission: NotificationPermission;
	isPending: boolean;
	onEnable: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="font-display flex items-center gap-2">
						<Bell className="w-4 h-4" />
						Enable reminders
					</DialogTitle>
					<DialogDescription>
						Get a push notification ~10 minutes before each scheduled dose.
					</DialogDescription>
				</DialogHeader>

				{iosNeedsInstall ? (
					<div className="space-y-3 text-sm">
						<div className="rounded-lg border border-dashed p-3 bg-secondary/40">
							<p className="font-semibold flex items-center gap-1.5">
								<Share className="w-3.5 h-3.5" />
								Install Tama first
							</p>
							<p className="text-muted-foreground mt-1">
								iPhone/iPad only delivers push notifications to home-screen
								apps. Tap the <strong>Share</strong> button in Safari, choose{" "}
								<strong>Add to Home Screen</strong>, then open Tama from your
								home screen and try again.
							</p>
						</div>
						<Badge variant="outline" className="text-[10px]">
							iOS 16.4+ required
						</Badge>
					</div>
				) : permission === "denied" ? (
					<div className="space-y-3 text-sm">
						<div className="rounded-lg border border-dashed p-3 bg-secondary/40">
							<p className="font-semibold">Notifications are blocked</p>
							<p className="text-muted-foreground mt-1">
								Open your browser's site settings for this page, change
								Notifications to "Allow", then reload.
							</p>
						</div>
					</div>
				) : (
					<div className="space-y-3 text-sm">
						<ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
							<li>Works on this device's browser (offline-tolerant).</li>
							<li>Tap a notification to jump straight to logging the dose.</li>
							<li>You can turn it off any time from this same button.</li>
						</ul>
						<Button onClick={onEnable} disabled={isPending} className="w-full">
							{isPending ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Bell className="w-4 h-4" />
							)}
							{isPending ? "Subscribing…" : "Allow notifications"}
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
