import { Badge } from "@/components/ui/badge.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpState } from "@/context.tsx";
import type { Prescription } from "@/types/api.ts";
import { InlineShell } from "./shell.tsx";

interface Result {
	prescriptions: Prescription[];
}

export default function PrescriptionListInline() {
	const state = useMcpState<unknown, Result>();
	const rxs = state.toolResult?.prescriptions ?? [];

	return (
		<InlineShell label="Listing prescriptions">
			<h2 className="text-base font-semibold mb-3">Prescriptions</h2>
			{rxs.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No prescriptions for this episode.
				</p>
			) : (
				<ul className="space-y-3">
					{rxs.map((rx) => (
						<li key={rx.id}>
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center justify-between text-base">
										<span>
											{rx.scheduleItems.length} item
											{rx.scheduleItems.length === 1 ? "" : "s"} •{" "}
											{new Date(rx.createdAt).toLocaleString()}
										</span>
										<Badge
											variant={
												rx.status === "confirmed" ? "default" : "outline"
											}
										>
											{rx.status}
										</Badge>
									</CardTitle>
								</CardHeader>
								<CardContent>
									<ul className="text-sm space-y-1">
										{rx.scheduleItems.map((it) => (
											<li key={`${it.name}-${it.times.join(",")}`}>
												<span className="font-medium">{it.name}</span>{" "}
												<span className="text-muted-foreground">
													[{it.kind}] {it.times.join(" / ")}
												</span>
											</li>
										))}
									</ul>
								</CardContent>
							</Card>
						</li>
					))}
				</ul>
			)}
		</InlineShell>
	);
}
