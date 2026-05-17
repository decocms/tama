import type { ReactNode } from "react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpState } from "../context.tsx";

export function StatusFrame({
	label,
	connectedHint,
	children,
}: {
	label: string;
	connectedHint?: string;
	children: ReactNode;
}) {
	const state = useMcpState();

	if (state.status === "initializing") {
		return (
			<Center>
				<Spinner />{" "}
				<span className="text-sm text-muted-foreground">Connecting…</span>
			</Center>
		);
	}

	if (state.status === "connected") {
		return (
			<Center>
				<Card className="w-full max-w-md text-center">
					<CardHeader>
						<CardTitle>{label}</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							{connectedHint ?? "Waiting for the agent to call this tool."}
						</p>
					</CardContent>
				</Card>
			</Center>
		);
	}

	if (state.status === "tool-input") {
		return (
			<Center>
				<Spinner />{" "}
				<span className="text-sm text-muted-foreground">{label}…</span>
			</Center>
		);
	}

	if (state.status === "error") {
		return (
			<Center>
				<Card className="w-full max-w-md border-destructive">
					<CardHeader>
						<CardTitle className="text-destructive">Error</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-destructive">
							{state.error ?? "Unknown error"}
						</p>
					</CardContent>
				</Card>
			</Center>
		);
	}

	if (state.status === "tool-cancelled") {
		return (
			<Center>
				<Card className="w-full max-w-md border-destructive">
					<CardHeader>
						<CardTitle className="text-destructive">Cancelled</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							The tool call was cancelled.
						</p>
					</CardContent>
				</Card>
			</Center>
		);
	}

	return <>{children}</>;
}

function Center({ children }: { children: ReactNode }) {
	return (
		<div className="flex items-center justify-center min-h-dvh p-6 gap-3">
			{children}
		</div>
	);
}

function Spinner() {
	return (
		<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
	);
}
