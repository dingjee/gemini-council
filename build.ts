import { fstat } from "fs";

console.log("Building Gemini Council...");

// Build content script
await Bun.build({
    entrypoints: ["./src/content.ts"],
    outdir: "./dist",
    target: "browser",
    minify: false, // Keep it readable for now
});

// Copy static assets
// Bun doesn't have a built-in copy, so we use shell or specific code
// Using Bun.write for simple copy or shelling out
import { cp } from "fs/promises";

await cp("./public", "./dist", { recursive: true });

console.log("Build complete! Load './dist' in Firefox.");
