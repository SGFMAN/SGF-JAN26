import fs from "fs";
import path from "path";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfPath = path.resolve(process.argv[2] || "SGF_Central_Management_Showcase.pdf");
const data = new Uint8Array(fs.readFileSync(pdfPath));
const doc = await getDocument({ data, disableWorker: true, verbosity: 0 }).promise;
fs.mkdirSync("clips/pages", { recursive: true });
console.log("pages", doc.numPages);
for (let n = 1; n <= doc.numPages; n += 1) {
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale: 1.4 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  const out = path.resolve("clips/pages", `page-${n}.png`);
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  console.log(out);
}
