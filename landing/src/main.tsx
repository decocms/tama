import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Landing } from "./Landing.tsx";
import "./index.css";

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<Landing />
	</StrictMode>,
);
