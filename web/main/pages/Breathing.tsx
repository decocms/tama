import { useNavigate } from "@tanstack/react-router";
import { BreathingCounter } from "../components/BreathingCounter.tsx";

// Respiratory-rate is its own top-level app (app_breathing → /breathing) so it
// can be pinned in studio. The camera counter is a full-screen overlay, so this
// page just mounts it always-open; closing returns to the Pet app.
export function BreathingPage() {
	const navigate = useNavigate();
	return <BreathingCounter open onClose={() => navigate({ to: "/" })} />;
}
