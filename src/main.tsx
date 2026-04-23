import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "leaflet/dist/leaflet.css";
import "./index.css";
import AuthProviderSupabase from "./contexts/AuthProviderSupabase";
import { BrowserRouter } from "react-router-dom";
import L from "leaflet";

// Fix missing default marker icons in bundlers
// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
	iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
	iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
	shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<AuthProviderSupabase>
			<BrowserRouter>
				<App />
			</BrowserRouter>
		</AuthProviderSupabase>
	</StrictMode>
);
