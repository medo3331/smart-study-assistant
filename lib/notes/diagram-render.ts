// lib/notes/diagram-render.ts
//
// Shared Mermaid → PNG rendering for AI page insertions. Renders strictly in
// the browser (mermaid is a client dependency) and bakes the SVG onto a white
// canvas so the result lives inside the page as a normal NoteImage.

/** ⼓ SVG string → PNG dataURL (2x) — الرسمة عشان تتخزن جوه الصفحة. */
export async function svgToPngDataUrl(svg: string, scale = 2): Promise<string | null> {
  try {
    const container = document.createElement("div");
    container.innerHTML = svg;
    const svgElement = container.querySelector("svg");
    if (!svgElement) return null;
    svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const viewBox = svgElement.getAttribute("viewBox") ?? "";
    let width = Number(svgElement.getAttribute("width")?.replace(/[^\d.]/g, "")) || 0;
    let height = Number(svgElement.getAttribute("height")?.replace(/[^\d.]/g, "")) || 0;
    if ((!width || !height) && viewBox) {
      const parts = viewBox.split(/[\s,]+/).map(Number);
      width = parts[2];
      height = parts[3];
    }
    if (!width || !height) return null;
    svgElement.setAttribute("width", String(width));
    svgElement.setAttribute("height", String(height));
    const blob = new Blob([new XMLSerializer().serializeToString(svgElement)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("svg load failed"));
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

let mermaidSeq = 0;

/** Mermaid code → PNG dataURL — بيرجع null لو الرسمة فشلت. */
export async function mermaidToPngDataUrl(mermaidCode: string): Promise<string | null> {
  const mermaid = (await import("mermaid")).default;
  // ثيم فاتح لأن الصفحة ورق أبيض، و htmlLabels=false عشان التحويل لـ PNG.
  mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    securityLevel: "strict",
    fontFamily: "Alexandria, Tahoma, sans-serif",
    flowchart: { htmlLabels: false, curve: "basis" },
  });
  mermaidSeq += 1;
  const { svg } = await mermaid.render(`magic-write-dg-${mermaidSeq}`, mermaidCode);
  return svgToPngDataUrl(svg);
}
