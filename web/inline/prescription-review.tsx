import { useMcpState } from "@/context.tsx";
import type { Prescription } from "@/types/api.ts";
import { PrescriptionReview } from "../main/components/PrescriptionReview.tsx";
import { InlineShell } from "./shell.tsx";

interface UploadResult {
	prescription: Prescription;
}

export default function InlinePrescriptionReview() {
	const state = useMcpState<unknown, UploadResult>();
	const rx = state.toolResult?.prescription;

	return (
		<InlineShell label="Extracting prescription">
			{rx ? (
				<PrescriptionReview prescription={rx} />
			) : (
				<p className="text-sm text-muted-foreground">
					No prescription to review.
				</p>
			)}
		</InlineShell>
	);
}
