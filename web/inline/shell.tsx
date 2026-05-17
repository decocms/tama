import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { StatusFrame } from "@/components/StatusFrame.tsx";

const queryClient = new QueryClient({
	defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

export function InlineShell({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<QueryClientProvider client={queryClient}>
			<StatusFrame label={label}>
				<div className="p-4 max-w-3xl mx-auto">{children}</div>
			</StatusFrame>
		</QueryClientProvider>
	);
}
