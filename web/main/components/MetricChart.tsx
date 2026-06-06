import { useMemo } from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ReferenceArea,
	ReferenceLine,
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

function median(nums: number[]): number {
	if (nums.length === 0) return 0;
	const s = [...nums].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
}

export function MetricChart({
	series,
	keys,
	height = 220,
	showLegend = true,
}: MetricChartProps) {
	// When more than one metric shares a chart, their raw magnitudes can differ
	// by orders (hemoglobin ~10 vs platelets ~400×10³), so a single linear axis
	// flattens the small ones. In that case we plot each metric as "% of its
	// normal range" (reference midpoint = 100%) — scale-free, and it reads
	// medically (above/below the 100% normal line). A single-metric chart keeps
	// raw values + the reference band.
	const multi = keys.length > 1;

	const { data, config, refBand, baseByKey } = useMemo(() => {
		// Per-key normalization base: reference midpoint if available, else the
		// metric's own median value (so it still scales to ~100%).
		const baseByKey = new Map<string, number>();
		if (multi) {
			for (const k of keys) {
				const pts = series.filter(
					(p) => p.canonicalKey === k && p.valueNum != null,
				);
				if (pts.length === 0) continue;
				const refs = pts.filter((p) => p.refLow != null && p.refHigh != null);
				let base: number;
				if (refs.length > 0) {
					base =
						(median(refs.map((p) => p.refLow as number)) +
							median(refs.map((p) => p.refHigh as number))) /
						2;
				} else {
					base = median(pts.map((p) => p.valueNum as number));
				}
				baseByKey.set(k, base || 1);
			}
		}

		// Group points by performedAt (rounded to the day) so multiple metrics
		// from the same exam land on one x-axis tick.
		const byDate = new Map<string, Record<string, number | string>>();
		const seenKeys = new Set<string>();

		for (const p of series) {
			if (!keys.includes(p.canonicalKey)) continue;
			if (p.valueNum == null) continue;
			const dayKey = p.performedAt.slice(0, 10);
			const row = byDate.get(dayKey) ?? { date: dayKey };
			if (multi) {
				const base = baseByKey.get(p.canonicalKey) ?? 1;
				row[p.canonicalKey] = Math.round((p.valueNum / base) * 1000) / 10;
				// Keep raw value + unit for the tooltip.
				row[`${p.canonicalKey}__raw`] = p.valueNum;
				if (p.unit) row[`${p.canonicalKey}__unit`] = p.unit;
			} else {
				row[p.canonicalKey] = p.valueNum;
			}
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

		// Reference band only on a single-metric chart (raw values).
		let refBand: { low: number; high: number } | null = null;
		if (!multi && keys.length === 1) {
			const key = keys[0];
			const pts = series.filter(
				(p) => p.canonicalKey === key && p.refLow != null && p.refHigh != null,
			);
			if (pts.length > 0) {
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

		return { data, config, refBand, baseByKey };
	}, [series, keys, multi]);

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
				<YAxis
					tickLine={false}
					axisLine={false}
					width={multi ? 40 : 36}
					tickFormatter={multi ? (v) => `${v}%` : undefined}
				/>
				{refBand ? (
					<ReferenceArea
						y1={refBand.low}
						y2={refBand.high}
						fill="hsl(var(--muted))"
						fillOpacity={0.35}
						stroke="none"
					/>
				) : null}
				{multi ? (
					// 100% = middle of the normal range for every metric.
					<ReferenceLine
						y={100}
						stroke="hsl(var(--muted-foreground))"
						strokeDasharray="4 4"
						strokeOpacity={0.5}
					/>
				) : null}
				<ChartTooltip
					content={
						<ChartTooltipContent
							indicator="dot"
							// In normalized mode show the real value + unit, not the %.
							formatter={
								multi
									? (value, name, item) => {
											const row = (item?.payload ?? {}) as Record<
												string,
												unknown
											>;
											const raw = row[`${name}__raw`];
											const unit = row[`${name}__unit`];
											const label = config[name as string]?.label ?? name;
											return (
												<span className="flex w-full justify-between gap-3">
													<span className="text-muted-foreground">{label}</span>
													<span className="font-mono font-medium tabular-nums">
														{raw != null ? String(raw) : String(value)}
														{unit ? ` ${unit}` : ""}
													</span>
												</span>
											);
										}
									: undefined
							}
						/>
					}
				/>
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
