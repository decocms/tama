import { useMemo } from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ReferenceArea,
	XAxis,
	YAxis,
} from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart.tsx";
import type { ExamMetricSeriesPoint } from "@/types/api.ts";
import { TAXONOMY_BY_KEY } from "../lib/taxonomy.ts";

interface MetricChartProps {
	series: ExamMetricSeriesPoint[];
	keys: string[];
	height?: number;
	showLegend?: boolean;
}

// Curated palette for line colors. Picked for visibility on both light and
// dark backgrounds; cycle through if more than 6 series are selected.
const PALETTE = [
	"#2563eb", // blue
	"#16a34a", // green
	"#dc2626", // red
	"#ea580c", // orange
	"#7c3aed", // violet
	"#0891b2", // cyan
];

function fmtTick(iso: string): string {
	try {
		const d = new Date(iso);
		return d.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
		});
	} catch {
		return iso;
	}
}

export function MetricChart({
	series,
	keys,
	height = 220,
	showLegend = true,
}: MetricChartProps) {
	const { data, config, refBand } = useMemo(() => {
		// Group points by performedAt (rounded to the day) so multiple metrics
		// from the same exam land on one x-axis tick.
		const byDate = new Map<string, Record<string, number | string>>();
		const seenKeys = new Set<string>();

		for (const p of series) {
			if (!keys.includes(p.canonicalKey)) continue;
			if (p.valueNum == null) continue;
			const dayKey = p.performedAt.slice(0, 10);
			const row = byDate.get(dayKey) ?? { date: dayKey };
			row[p.canonicalKey] = p.valueNum;
			byDate.set(dayKey, row);
			seenKeys.add(p.canonicalKey);
		}

		const data = Array.from(byDate.values()).sort((a, b) =>
			String(a.date).localeCompare(String(b.date)),
		);

		const config: ChartConfig = {};
		Array.from(seenKeys).forEach((k, i) => {
			const def = TAXONOMY_BY_KEY[k];
			config[k] = {
				label: def?.label ?? k,
				color: PALETTE[i % PALETTE.length],
			};
		});

		// Reference band only when exactly one series is selected and refLow/refHigh
		// are stable across points. Multiple series with different ranges would
		// overlap and confuse the reader.
		let refBand: { low: number; high: number } | null = null;
		if (keys.length === 1) {
			const key = keys[0];
			const pts = series.filter(
				(p) =>
					p.canonicalKey === key && p.refLow != null && p.refHigh != null,
			);
			if (pts.length > 0) {
				const lows = new Set(pts.map((p) => p.refLow));
				const highs = new Set(pts.map((p) => p.refHigh));
				if (lows.size === 1 && highs.size === 1) {
					refBand = {
						low: pts[0].refLow as number,
						high: pts[0].refHigh as number,
					};
				} else {
					// Pick the median range as a compromise so the user still gets
					// a visual cue even when ranges drift slightly between labs.
					const sortedLows = pts
						.map((p) => p.refLow as number)
						.sort((a, b) => a - b);
					const sortedHighs = pts
						.map((p) => p.refHigh as number)
						.sort((a, b) => a - b);
					refBand = {
						low: sortedLows[Math.floor(sortedLows.length / 2)],
						high: sortedHighs[Math.floor(sortedHighs.length / 2)],
					};
				}
			}
		}

		return { data, config, refBand };
	}, [series, keys]);

	if (data.length === 0) {
		return (
			<div className="text-xs text-muted-foreground py-6 text-center">
				No numeric values yet.
			</div>
		);
	}

	return (
		<ChartContainer
			config={config}
			className="w-full"
			style={{ height, aspectRatio: undefined }}
		>
			<LineChart data={data} margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
				<CartesianGrid vertical={false} strokeDasharray="3 3" />
				<XAxis
					dataKey="date"
					tickFormatter={fmtTick}
					tickLine={false}
					axisLine={false}
					minTickGap={24}
				/>
				<YAxis tickLine={false} axisLine={false} width={36} />
				{refBand ? (
					<ReferenceArea
						y1={refBand.low}
						y2={refBand.high}
						fill="hsl(var(--muted))"
						fillOpacity={0.35}
						stroke="none"
					/>
				) : null}
				<ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
				{Object.keys(config).map((k) => (
					<Line
						key={k}
						type="monotone"
						dataKey={k}
						stroke={`var(--color-${k})`}
						strokeWidth={2}
						dot={{ r: 3 }}
						connectNulls
					/>
				))}
			</LineChart>
		</ChartContainer>
	);
}
