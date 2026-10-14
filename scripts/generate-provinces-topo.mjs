import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as topojsonServer from "topojson-server";
import * as topojsonClient from "topojson-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const geojsonPath = path.join(rootDir, "public", "provincias_spain.geojson");
const topojsonPath = path.join(rootDir, "public", "provincias_spain.topo.json");

console.log("Leyendo", geojsonPath, "...");
const geojson = JSON.parse(fs.readFileSync(geojsonPath, "utf-8"));

console.log(`Procesando ${geojson.features.length} provincias a TopoJSON...`);
const topo = topojsonClient.quantize(
  topojsonServer.topology({ provincias: geojson }),
  1e5
);

fs.writeFileSync(topojsonPath, JSON.stringify(topo));
const stats = fs.statSync(topojsonPath);
const origStats = fs.statSync(geojsonPath);

console.log(`✓ Archivo generado con éxito en ${topojsonPath}`);
console.log(`  Tamaño original: ${(origStats.size / 1024).toFixed(1)} KB`);
console.log(`  Nuevo tamaño:    ${(stats.size / 1024).toFixed(1)} KB (${(((origStats.size - stats.size) / origStats.size) * 100).toFixed(1)}% de reducción)`);
