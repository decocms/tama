import { Link, useSearch } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type { ExamMetricSeriesPoint } from "@/types/api.ts";
import {
	ExplainButton,
	InsightsCard,
	useExplainState,
} from "../components/ExamInsights.tsx";
import { Layout } from "../components/Layout.tsx";
import { MetricChart } from "../components/MetricChart.tsx";
import { Section } from "../components/Section.tsx";
import { useMetricSeries, usePet } from "../lib/queries.ts";
import {
	type Panel,
	PANELS,
	PANEL_LABEL,
	TAXONOMY_BY_KEY,
	panelOf,
} from "../lib/taxonomy.ts";

interface ExamsDetailSearch {
	keys?: string;
}

export function ExamsDetailPage() {
	const search = useSearch({ from: "/exams/detail" }) as
		| ExamsDetailSearch
		| undefined;
	const { data: pet } = usePet();
	const { data: series, isLoading } = useMetricSeries([]);

	const selectedKeys = useMemo(() => {
		const raw = search?.keys?.split(",").filter(Boolean) ?? [];
		return new Set(raw);
	}, [search?.keys]);

	const setSelectedKeys = (next: Set<string>) => {
		const csv = Array.from(next).sort().join(",");
		const url = new URL(window.location.href);
		const hash = url.hash.replace(/^#/, "");
		const [path] = hash.split("?");
		const newHash = csv ? `${path}?keys=${encodeURIComponent(csv)}` : path;
		window.location.hash = `#${newHash}`;
	};

	const toggleKey = (k: string) => {
		const next = new Set(selectedKeys);
		if (next.has(k)) next.delete(k);
		else next.add(k);
		setSelectedKeys(next);
	};

	const byPanel = useMemo(() => groupByPanel(series ?? []), [series]);
	const selectedArr = Array.from(selectedKeys);
	const explain = useExplainState();
	const [filtersOpen, setFiltersOpen] = useState(false);

	const selector = (
		<MetricSelector
			byPanel={byPanel}
			selectedKeys={selectedKeys}
			toggleKey={toggleKey}
			emptyHint={!isLoading && (series ?? []).length === 0}
		/>
	);

	return (
		<Layout
			breadcrumb={
				<span className="flex items-center gap-2">
					<Link to="/exams" className="hover:underline">
						exams
					</Link>
					<span>/</span>
					<span>detail</span>
				</span>
			}
		>
			<div className="max-w-5xl mx-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 md:gap-6">
				{/* Desktop: persistent sidebar. Hidden on mobile (where it would
				    dump every metric checkbox above the chart). */}
				<aside className="hidden md:block space-y-4">{selector}</aside>

				<div className="space-y-4">
					{/* Mobile: the chart leads; metrics are a collapsed disclosure. */}
					<div className="md:hidden">
						<Button
							variant="outline"
							size="sm"
							className="w-full justify-between"
							onClick={() => setFiltersOpen((v) => !v)}
						>
							<span className="inline-flex items-center gap-2">
								<SlidersHorizontal className="w-4 h-4" />
								Metrics
							</span>
							<span className="text-xs text-muted-foreground">
								{selectedArr.length} selected · {filtersOpen ? "hide" : "change"}
							</span>
						</Button>
						{filtersOpen ? (
							<div className="mt-2 rounded-2xl bg-card surface p-4 max-h-[50dvh] overflow-y-auto">
								{selector}
							</div>
						) : null}
					</div>

					<Section
						title={
							selectedArr.length === 0
								? "Pick metrics to chart"
								: selectedArr
										.map((k) => TAXONOMY_BY_KEY[k]?.label ?? k)
										.join(" · ")
						}
						eyebrow="Evolution"
						action={
							selectedArr.length > 0 ? (
								<ExplainButton
									onClick={() => explain.run(selectedArr)}
									pending={explain.pending}
								/>
							) : null
						}
					>
						<InsightsCard
							pending={explain.pending}
							error={explain.error}
							text={explain.text}
							petName={pet?.name}
						/>
						{isLoading ? (
							<Skeleton className="h-64 w-full rounded-xl" />
						) : selectedArr.length === 0 ? (
							<p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground bg-secondary/40">
								Choose one or more metrics (the <strong>Metrics</strong> button
								on mobile, the sidebar on desktop) to plot them.
							</p>
						) : (
							<div className="rounded-2xl bg-card surface p-4">
								<MetricChart
									series={series ?? []}
									keys={selectedArr}
									height={360}
								/>
								<MetricLegend
									series={series ?? []}
									keys={selectedArr}
								/>
							</div>
						)}
					</Section>
				</div>
			</div>
		</Layout>
	);
}

function MetricSelector({
	byPanel,
	selectedKeys,
	toggleKey,
	emptyHint,
}: {
	byPanel: Map<Panel, { key: string; label: string; count: number }[]>;
	selectedKeys: Set<string>;
	toggleKey: (k: string) => void;
	emptyHint: boolean;
}) {
	return (
		<div className="space-y-4">
			<div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
				Metrics
			</div>
			{PANELS.map((panel) => {
				const items = byPanel.get(panel) ?? [];
				if (items.length === 0) return null;
				return (
					<div key={panel} className="space-y-1.5">
						<div className="text-xs font-semibold">{PANEL_LABEL[panel]}</div>
						{items.map((it) => (
							<label
								key={it.key}
								className="flex items-center gap-2 text-sm cursor-pointer py-0.5"
							>
								<Checkbox
									checked={selectedKeys.has(it.key)}
									onCheckedChange={() => toggleKey(it.key)}
								/>
								<span className="flex-1 truncate">{it.label}</span>
								<span className="text-muted-foreground tabular-nums text-xs">
									{it.count}
								</span>
							</label>
						))}
					</div>
				);
			})}
			{emptyHint ? (
				<p className="text-xs text-muted-foreground">No confirmed exams yet.</p>
			) : null}
		</div>
	);
}

function MetricLegend({
	series,
	keys,
}: {
	series: ExamMetricSeriesPoint[];
	keys: string[];
}) {
	return (
		<ul className="mt-3 text-xs text-muted-foreground space-y-1">
			{keys.map((k) => {
				const pts = series.filter((p) => p.canonicalKey === k);
				const last = pts[pts.length - 1];
				if (!last) return null;
				return (
					<li key={k}>
						<span className="font-medium text-foreground">
							{TAXONOMY_BY_KEY[k]?.label ?? k}
						</span>
						{last.valueNum != null ? (
							<>
								: latest <strong>{last.valueNum}</strong>
								{last.unit ? ` ${last.unit}` : ""}
								{last.refLow != null && last.refHigh != null
									? ` (ref ${last.refLow}–${last.refHigh})`
									: ""}
							</>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}

function groupByPanel(
	series: ExamMetricSeriesPoint[],
): Map<Panel, { key: string; label: string; count: number }[]> {
	const counts = new Map<string, number>();
	for (const p of series) {
		counts.set(p.canonicalKey, (counts.get(p.canonicalKey) ?? 0) + 1);
	}
	const out = new Map<Panel, { key: string; label: string; count: number }[]>();
	for (const [key, count] of counts) {
		const panel = panelOf(key);
		const label = TAXONOMY_BY_KEY[key]?.label ?? key;
		const arr = out.get(panel) ?? [];
		arr.push({ key, label, count });
		out.set(panel, arr);
	}
	for (const arr of out.values()) {
		arr.sort((a, b) => a.label.localeCompare(b.label));
	}
	return out;
}
