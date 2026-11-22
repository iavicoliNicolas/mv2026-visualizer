import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/newsreader/latin-400.css";
import "@fontsource/newsreader/latin-500.css";
import "@fontsource/newsreader/latin-600.css";
import { Workbench } from "@/components/workbench";
import "@/styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("No está el nodo #root");

createRoot(root).render(
  <StrictMode>
    <Workbench />
  </StrictMode>,
);
