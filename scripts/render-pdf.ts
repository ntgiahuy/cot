import { readFileSync, writeFileSync } from "node:fs";
import { generateColumnPdf } from "../src/lib/pdf";
import { createSampleProject } from "../src/lib/sample";
import { buildSchedule, summaryBuckets, stockBars } from "../src/lib/calc";

async function main() {
  const project = createSampleProject();
  const { byDia, stirrupCounts, rows } = buildSchedule(project);
  console.log("rows", rows.length);
  [...byDia.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([dia, val]) => {
      console.log(`Ø${dia}`, val.weight.toFixed(1), "kg", val.length.toFixed(2), "m", "bars", stockBars(val.length));
    });
  console.log(summaryBuckets(byDia));
  stirrupCounts.forEach((n, k) => console.log(k, n));

  const regular = readFileSync("public/fonts/BeVietnamPro-Regular.ttf");
  const bold = readFileSync("public/fonts/BeVietnamPro-Bold.ttf");
  const bytes = await generateColumnPdf(project, {
    regular: regular.buffer.slice(regular.byteOffset, regular.byteOffset + regular.byteLength),
    bold: bold.buffer.slice(bold.byteOffset, bold.byteOffset + bold.byteLength),
  });
  const out = process.argv[2] || "/tmp/column-output.pdf";
  writeFileSync(out, bytes);
  console.log("wrote", out, bytes.byteLength);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
