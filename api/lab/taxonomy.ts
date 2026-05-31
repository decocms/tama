// Curated canonical taxonomy of veterinary lab metrics. The LLM extractor
// receives this list and is asked to map every parameter on a report into one
// of these canonical keys. When it sees something outside the list it
// proposes a snake_case key and we flag the metric for review.
//
// `synonyms` is intentionally generous (Portuguese + English + common
// abbreviations) because Brazilian labs (IEMEV, E+LAB, ...) print under
// Portuguese names. `refByCanine` is a fallback range used only when a lab
// doesn't print one — the metric's own refLow/refHigh always wins.

export type Panel =
	| "cbc"
	| "biochem-liver"
	| "biochem-kidney"
	| "biochem-protein"
	| "pancreas"
	| "glucose"
	| "electrolytes"
	| "other";

export interface MetricDef {
	key: string;
	label: string;
	unit: string;
	synonyms: string[];
	panel: Panel;
	refByCanine?: { low?: number; high?: number };
}

export const LAB_TAXONOMY: MetricDef[] = [
	// ---- CBC ----
	{
		key: "hemoglobin",
		label: "Hemoglobin",
		unit: "g/dL",
		panel: "cbc",
		synonyms: ["hemoglobina", "hb", "hgb"],
		refByCanine: { low: 12.0, high: 18.0 },
	},
	{
		key: "hematocrit",
		label: "Hematocrit",
		unit: "%",
		panel: "cbc",
		synonyms: ["hematócrito", "hematocrito", "ht", "hct", "pcv", "globulos"],
		refByCanine: { low: 37, high: 55 },
	},
	{
		key: "rbc",
		label: "RBC",
		unit: "10^6/µL",
		panel: "cbc",
		synonyms: ["hemácias", "hemacias", "eritrócitos", "eritrocitos", "red blood cells"],
		refByCanine: { low: 5.5, high: 8.5 },
	},
	{
		key: "mcv",
		label: "MCV",
		unit: "fL",
		panel: "cbc",
		synonyms: ["vcm", "volume corpuscular médio", "volume corpuscular medio"],
		refByCanine: { low: 60, high: 77 },
	},
	{
		key: "mchc",
		label: "MCHC",
		unit: "g/dL",
		panel: "cbc",
		synonyms: ["chcm", "concentração de hemoglobina corpuscular média"],
		refByCanine: { low: 32, high: 36 },
	},
	{
		key: "reticulocytes",
		label: "Reticulocytes",
		unit: "/µL",
		panel: "cbc",
		synonyms: ["reticulócitos", "reticulocitos", "retic"],
	},
	{
		key: "wbc",
		label: "WBC",
		unit: "10^3/µL",
		panel: "cbc",
		synonyms: ["leucócitos", "leucocitos", "white blood cells", "global de leucócitos"],
		refByCanine: { low: 6.0, high: 17.0 },
	},
	{
		key: "neutrophils",
		label: "Neutrophils",
		unit: "/µL",
		panel: "cbc",
		synonyms: ["neutrófilos", "neutrofilos", "segmentados"],
	},
	{
		key: "lymphocytes",
		label: "Lymphocytes",
		unit: "/µL",
		panel: "cbc",
		synonyms: ["linfócitos", "linfocitos"],
	},
	{
		key: "monocytes",
		label: "Monocytes",
		unit: "/µL",
		panel: "cbc",
		synonyms: ["monócitos", "monocitos"],
	},
	{
		key: "eosinophils",
		label: "Eosinophils",
		unit: "/µL",
		panel: "cbc",
		synonyms: ["eosinófilos", "eosinofilos"],
	},
	{
		key: "basophils",
		label: "Basophils",
		unit: "/µL",
		panel: "cbc",
		synonyms: ["basófilos", "basofilos"],
	},
	{
		key: "platelets",
		label: "Platelets",
		unit: "10^3/µL",
		panel: "cbc",
		synonyms: ["plaquetas", "plt"],
		refByCanine: { low: 200, high: 500 },
	},
	// ---- Liver ----
	{
		key: "alt",
		label: "ALT (TGP)",
		unit: "U/L",
		panel: "biochem-liver",
		synonyms: ["tgp", "alt", "alanina aminotransferase", "alanina aminotransferase (tgp)"],
		refByCanine: { low: 4, high: 66 },
	},
	{
		key: "ast",
		label: "AST (TGO)",
		unit: "U/L",
		panel: "biochem-liver",
		synonyms: ["tgo", "ast", "aspartato aminotransferase"],
		refByCanine: { low: 10, high: 50 },
	},
	{
		key: "alp",
		label: "ALP",
		unit: "U/L",
		panel: "biochem-liver",
		synonyms: ["fosfatase alcalina", "fa", "alp", "alkaline phosphatase"],
		refByCanine: { low: 8, high: 88 },
	},
	{
		key: "ggt",
		label: "GGT",
		unit: "U/L",
		panel: "biochem-liver",
		synonyms: ["gama gt", "gama glutamil transferase", "ggt"],
	},
	{
		key: "bilirubin_total",
		label: "Bilirubin (total)",
		unit: "mg/dL",
		panel: "biochem-liver",
		synonyms: ["bilirrubina total", "bilirubin", "bt"],
	},
	// ---- Kidney ----
	{
		key: "urea",
		label: "Urea (BUN)",
		unit: "mg/dL",
		panel: "biochem-kidney",
		synonyms: ["uréia", "ureia", "bun", "blood urea nitrogen"],
		refByCanine: { low: 11, high: 60 },
	},
	{
		key: "creatinine",
		label: "Creatinine",
		unit: "mg/dL",
		panel: "biochem-kidney",
		synonyms: ["creatinina", "creat"],
		refByCanine: { low: 0.5, high: 1.5 },
	},
	{
		key: "sdma",
		label: "SDMA",
		unit: "µg/dL",
		panel: "biochem-kidney",
		synonyms: ["sdma", "dimethylarginine"],
	},
	{
		key: "phosphorus",
		label: "Phosphorus",
		unit: "mg/dL",
		panel: "biochem-kidney",
		synonyms: ["fósforo", "fosforo", "phosphate", "p"],
		refByCanine: { low: 2.5, high: 6.0 },
	},
	// ---- Protein ----
	{
		key: "albumin",
		label: "Albumin",
		unit: "g/dL",
		panel: "biochem-protein",
		synonyms: ["albumina"],
		refByCanine: { low: 2.3, high: 3.3 },
	},
	{
		key: "total_protein",
		label: "Total protein",
		unit: "g/dL",
		panel: "biochem-protein",
		synonyms: ["proteína total", "proteina total", "total protein", "pt"],
		refByCanine: { low: 5.5, high: 7.5 },
	},
	{
		key: "globulin",
		label: "Globulin",
		unit: "g/dL",
		panel: "biochem-protein",
		synonyms: ["globulina", "globulinas"],
		refByCanine: { low: 2.7, high: 4.4 },
	},
	// ---- Pancreas ----
	{
		key: "cpli",
		label: "Canine pancreatic lipase (cPLI)",
		unit: "ng/mL",
		panel: "pancreas",
		synonyms: ["cpli", "cpl", "pancreatic lipase", "lipase pancreática", "spec cpl"],
	},
	{
		key: "amylase",
		label: "Amylase",
		unit: "U/L",
		panel: "pancreas",
		synonyms: ["amilase"],
	},
	{
		key: "lipase",
		label: "Lipase",
		unit: "U/L",
		panel: "pancreas",
		synonyms: ["lipase"],
	},
	// ---- Glucose ----
	{
		key: "glucose",
		label: "Glucose",
		unit: "mg/dL",
		panel: "glucose",
		synonyms: ["glicose", "glucose", "blood glucose", "glicemia"],
		refByCanine: { low: 70, high: 120 },
	},
	{
		key: "fructosamine",
		label: "Fructosamine",
		unit: "µmol/L",
		panel: "glucose",
		synonyms: ["frutosamina", "fructosamine"],
	},
	// ---- Electrolytes ----
	{
		key: "sodium",
		label: "Sodium",
		unit: "mmol/L",
		panel: "electrolytes",
		synonyms: ["sódio", "sodio", "na"],
		refByCanine: { low: 140, high: 155 },
	},
	{
		key: "potassium",
		label: "Potassium",
		unit: "mmol/L",
		panel: "electrolytes",
		synonyms: ["potássio", "potassio", "k"],
		refByCanine: { low: 3.5, high: 5.5 },
	},
	{
		key: "chloride",
		label: "Chloride",
		unit: "mmol/L",
		panel: "electrolytes",
		synonyms: ["cloreto", "cl"],
		refByCanine: { low: 105, high: 120 },
	},
	{
		key: "calcium",
		label: "Calcium",
		unit: "mg/dL",
		panel: "electrolytes",
		synonyms: ["cálcio", "calcio", "ca"],
		refByCanine: { low: 9.0, high: 11.5 },
	},
];

export const TAXONOMY_BY_KEY: Record<string, MetricDef> = Object.fromEntries(
	LAB_TAXONOMY.map((m) => [m.key, m]),
);

export const PANEL_LABEL: Record<Panel, string> = {
	cbc: "CBC",
	"biochem-liver": "Liver",
	"biochem-kidney": "Kidney",
	"biochem-protein": "Protein",
	pancreas: "Pancreas",
	glucose: "Glucose",
	electrolytes: "Electrolytes",
	other: "Other",
};

// Compact JSON the system prompt embeds. We strip refByCanine to keep the
// payload small — the model is the normalizer, not the range source.
export function taxonomyForPrompt(): string {
	return JSON.stringify(
		LAB_TAXONOMY.map((m) => ({
			key: m.key,
			label: m.label,
			unit: m.unit,
			panel: m.panel,
			synonyms: m.synonyms,
		})),
	);
}
