import React from "react";
import { createRoot } from "react-dom/client";
import { ThreeViewer } from "./ThreeViewer";

if (document.getElementById("root")) {
    const root = createRoot(document.getElementById("root")!);
    root.render(<ThreeViewer />);
}
