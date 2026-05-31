// Frontend mirror of api/lab/taxonomy.ts. The backend embeds the full taxonomy
// in the LLM prompt; the frontend only needs the key → label/panel/unit mapping
// to render charts and the metric combobox.

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
	panel: Panel;
}

export const LAB_TAXONOMY: MetricDef[] = [
	{ key: "hemoglobin", label: "Hemoglobin", unit: "g/dL", panel: "cbc" },
	{ key: "hematocrit", label: "Hematocrit", unit: "%", panel: "cbc" },
	{ key: "rbc", label: "RBC", unit: "10^6/µL", panel: "cbc" },
	{ key: "mcv", label: "MCV", unit: "fL", panel: "cbc" },
	{ key: "mchc", label: "MCHC", unit: "g/dL", panel: "cbc" },
	{ key: "reticulocytes", label: "Reticulocytes", unit: "/µL", panel: "cbc" },
	{ key: "wbc", label: "WBC", unit: "10^3/µL", panel: "cbc" },
	{ key: "neutrophils", label: "Neutrophils", unit: "/µL", panel: "cbc" },
	{ key: "lymphocytes", label: "Lymphocytes", unit: "/µL", panel: "cbc" },
	{ key: "monocytes", label: "Monocytes", unit: "/µL", panel: "cbc" },
	{ key: "eosinophils", label: "Eosinophils", unit: "/µL", panel: "cbc" },
	{ key: "basophils", label: "Basophils", unit: "/µL", panel: "cbc" },
	{ key: "platelets", label: "Platelets", unit: "10^3/µL", panel: "cbc" },
	{ key: "alt", label: "ALT (TGP)", unit: "U/L", panel: "biochem-liver" },
	{ key: "ast", label: "AST (TGO)", unit: "U/L", panel: "biochem-liver" },
	{ key: "alp", label: "ALP", unit: "U/L", panel: "biochem-liver" },
	{ key: "ggt", label: "GGT", unit: "U/L", panel: "biochem-liver" },
	{
		key: "bilirubin_total",
		label: "Bilirubin (total)",
		unit: "mg/dL",
		panel: "biochem-liver",
	},
	{ key: "urea", label: "Urea (BUN)", unit: "mg/dL", panel: "biochem-kidney" },
	{
		key: "creatinine",
		label: "Creatinine",
		unit: "mg/dL",
		panel: "biochem-kidney",
	},
	{ key: "sdma", label: "SDMA", unit: "µg/dL", panel: "biochem-kidney" },
	{
		key: "phosphorus",
		label: "Phosphorus",
		unit: "mg/dL",
		panel: "biochem-kidney",
	},
	{ key: "albumin", label: "Albumin", unit: "g/dL", panel: "biochem-protein" },
	{
		key: "total_protein",
		label: "Total protein",
		unit: "g/dL",
		panel: "biochem-protein",
	},
	{
		key: "globulin",
		label: "Globulin",
		unit: "g/dL",
		panel: "biochem-protein",
	},
	{
		key: "cpli",
		label: "Canine pancreatic lipase (cPLI)",
		unit: "ng/mL",
		panel: "pancreas",
	},
	{ key: "amylase", label: "Amylase", unit: "U/L", panel: "pancreas" },
	{ key: "lipase", label: "Lipase", unit: "U/L", panel: "pancreas" },
	{ key: "glucose", label: "Glucose", unit: "mg/dL", panel: "glucose" },
	{
		key: "fructosamine",
		label: "Fructosamine",
		unit: "µmol/L",
		panel: "glucose",
	},
	{ key: "sodium", label: "Sodium", unit: "mmol/L", panel: "electrolytes" },
	{
		key: "potassium",
		label: "Potassium",
		unit: "mmol/L",
		panel: "electrolytes",
	},
	{ key: "chloride", label: "Chloride", unit: "mmol/L", panel: "electrolytes" },
	{ key: "calcium", label: "Calcium", unit: "mg/dL", panel: "electrolytes" },
];

export const TAXONOMY_BY_KEY: Record<string, MetricDef> = Object.fromEntries(
	LAB_TAXONOMY.map((m) => [m.key, m]),
);

export const PANELS: Panel[] = [
	"cbc",
	"biochem-liver",
	"biochem-kidney",
	"biochem-protein",
	"pancreas",
	"glucose",
	"electrolytes",
	"other",
];

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

// Default keys per panel for the overview small-multiples. Picked the most
// commonly tracked across labs so first impressions are signal-dense.
export const PANEL_DEFAULT_KEYS: Record<Panel, string[]> = {
	cbc: ["hemoglobin", "hematocrit", "platelets"],
	"biochem-liver": ["alt", "alp"],
	"biochem-kidney": ["urea", "creatinine"],
	"biochem-protein": ["albumin", "total_protein"],
	pancreas: ["cpli"],
	glucose: ["glucose"],
	electrolytes: ["sodium", "potassium"],
	other: [],
};

export function panelOf(key: string | null): Panel {
	if (!key) return "other";
	return TAXONOMY_BY_KEY[key]?.panel ?? "other";
}
