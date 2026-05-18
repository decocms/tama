"use client";

import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			className="toaster group"
			icons={{
				success: <CircleCheckIcon className="size-4" />,
				info: <InfoIcon className="size-4" />,
				warning: <TriangleAlertIcon className="size-4" />,
				error: <OctagonXIcon className="size-4" />,
				loading: <Loader2Icon className="size-4 animate-spin" />,
			}}
			toastOptions={{
				classNames: {
					toast:
						"!bg-[var(--color-background-tertiary)] !border !border-border !text-foreground !shadow-lg",
					title: "!font-medium",
					description: "!text-muted-foreground",
				},
			}}
			style={
				{
					"--normal-bg": "var(--color-background-tertiary)",
					"--normal-text": "var(--color-text-primary)",
					"--normal-border": "var(--color-border-secondary)",
					"--border-radius": "0.75rem",
				} as React.CSSProperties
			}
			{...props}
		/>
	);
};

export { Toaster };
