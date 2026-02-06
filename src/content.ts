console.log("Gemini Council: Content script loaded.");

// Simple UI to verify injection
const indicator = document.createElement("div");
indicator.style.position = "fixed";
indicator.style.bottom = "20px";
indicator.style.right = "20px";
indicator.style.width = "20px";
indicator.style.height = "20px";
indicator.style.backgroundColor = "#4CAF50";
indicator.style.borderRadius = "50%";
indicator.style.zIndex = "9999";
indicator.title = "Gemini Council Active";
document.body.appendChild(indicator);
