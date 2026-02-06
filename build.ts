import { fstat } from "fs";
import { cp } from "fs/promises";

console.log("Building Gemini Council...");

// Build content script
await Bun.build({
    entrypoints: ["./src/content.ts", "./src/background.ts"],
    outdir: "./dist",
    target: "browser",
    define: {
        "process.env.OPENROUTER_API_KEY": JSON.stringify(Bun.env.OPENROUTER_API_KEY || ""),
    },
    minify: false, // Keep it readable for now
});

// Copy static assets
await cp("./public", "./dist", { recursive: true });

console.log("Build complete! Load './dist' in Firefox.");
