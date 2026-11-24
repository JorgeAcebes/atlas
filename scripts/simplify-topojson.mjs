import fs from "node:fs";
import path from "node:path";
import { feature } from "topojson-client";
import { resolveCountryFromFeature } from "../data/countries";
import { peakByCode } from "../data/peaks";

function decodeArc(arc, transform) {
  const scaleX = transform?.scale?.[0] ?? 1;
  const scaleY = transform?.scale?.[1] ?? 1;
  const transX = transform?.translate?.[0] ?? 0;
  const transY = transform?.translate?.[1] ?? 0;

  const qPts = new Array(arc.length);
  const degPts = new Array(arc.length);
  let x = 0;
  let y = 0;
  for (let i = 0; i < arc.length; i++) {
    x += arc[i][0];
    y += arc[i][1];
    qPts[i] = [x, y];
    degPts[i] = [x * scaleX + transX, y * scaleY + transY];
  }
  return { qPts, degPts };
}

function encodeArc(qPts, keepIndices) {
  const out = new Array(keepIndices.length);
  out[0] = [qPts[keepIndices[0]][0], qPts[keepIndices[0]][1]];
  for (let k = 1; k < keepIndices.length; k++) {
    const prev = qPts[keepIndices[k - 1]];
    const curr = qPts[keepIndices[k]];
    out[k] = [curr[0] - prev[0], curr[1] - prev[1]];
  }
  return out;
}

function pointSegmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(p[0] - a[0], p[1] - a[1]);
  }
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  return Math.hypot(p[0] - projX, p[1] - projY);
}

function dpRange(degPts, start, end, tol, keepFlags) {
  const stack = [[start, end]];
  while (stack.length > 0) {
    const [s, e] = stack.pop();
    if (e - s <= 1) continue;
    let maxDist = -1;
    let maxIdx = -1;
    const a = degPts[s];
    const b = degPts[e];
    for (let i = s + 1; i < e; i++) {
      const d = pointSegmentDistance(degPts[i], a, b);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxIdx !== -1 && maxDist > tol) {
      keepFlags[maxIdx] = 1;
      stack.push([s, maxIdx], [maxIdx, e]);
    }
  }
}

function simplifySingleArc(arc, transform, baseTol, smallSpanThreshold) {
  if (arc.length <= 4) return arc;

  const { qPts, degPts } = decodeArc(arc, transform);
  const n = qPts.length;
  const isClosed =
    qPts[0][0] === qPts[n - 1][0] && qPts[0][1] === qPts[n - 1][1];

  if (isClosed && n <= 6) return arc;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const [lx, ly] = degPts[i];
    if (lx < minX) minX = lx;
    if (lx > maxX) maxX = lx;
    if (ly < minY) minY = ly;
    if (ly > maxY) maxY = ly;
  }
  const span = Math.max(maxX - minX, maxY - minY);
  const tol = span < smallSpanThreshold ? baseTol * 0.25 : baseTol;

  const keepFlags = new Uint8Array(n);
  keepFlags[0] = 1;
  keepFlags[n - 1] = 1;

  if (isClosed) {
    let farIdx = 1;
    let farDist = -1;
    for (let i = 1; i < n - 1; i++) {
      const d = Math.hypot(degPts[i][0] - degPts[0][0], degPts[i][1] - degPts[0][1]);
      if (d > farDist) {
        farDist = d;
        farIdx = i;
      }
    }
    keepFlags[farIdx] = 1;
    dpRange(degPts, 0, farIdx, tol, keepFlags);
    dpRange(degPts, farIdx, n - 1, tol, keepFlags);

    // Ensure every closed ring preserves at least 4 quantized vertices
    let count = 0;
    for (let i = 0; i < n; i++) count += keepFlags[i];
    if (count < 4) {
      const step = Math.max(1, Math.floor((n - 1) / 3));
      keepFlags[Math.min(n - 2, step)] = 1;
      keepFlags[Math.min(n - 2, step * 2)] = 1;
    }
  } else {
    dpRange(degPts, 0, n - 1, tol, keepFlags);
  }

  const keepIndices = [];
  for (let i = 0; i < n; i++) {
    if (keepFlags[i]) keepIndices.push(i);
  }

  return encodeArc(qPts, keepIndices);
}

function collectFeatureStats(fc) {
  let degenerateRings = 0;
  let minRings = Infinity;
  let totalRings = 0;

  const visitRing = (ring) => {
    totalRings++;
    if (!Array.isArray(ring) || ring.length < 4) {
      degenerateRings++;
    }
  };

  for (const feat of fc.features) {
    const g = feat.geometry;
    if (!g) continue;
    if (g.type === "Polygon") {
      g.coordinates.forEach(visitRing);
      minRings = Math.min(minRings, g.coordinates.length);
    } else if (g.type === "MultiPolygon") {
      let count = 0;
      g.coordinates.forEach((poly) => {
        count += poly.length;
        poly.forEach(visitRing);
      });
      minRings = Math.min(minRings, count);
    }
  }
  return { totalRings, degenerateRings, featureCount: fc.features.length };
}

function simplifyTopologyFile({
  filePath,
  primaryObjectKey,
  secondaryObjectKeys = [],
  baseTol,
  smallSpanThreshold,
  resolveKey,
  label,
}) {
  const raw = fs.readFileSync(filePath, "utf8");
  const topo = JSON.parse(raw);

  const beforeVertices = topo.arcs.reduce((sum, a) => sum + a.length, 0);
  const beforeBytes = Buffer.byteLength(raw, "utf8");
  const beforePrimary = feature(topo, topo.objects[primaryObjectKey]);
  const beforeResolvedKeys = new Set(
    beforePrimary.features.map(resolveKey).filter(Boolean)
  );
  const beforeStats = collectFeatureStats(beforePrimary);

  // Protect any arc belonging to a single-arc tiny geometry if needed; run simplification
  const simplifiedArcs = topo.arcs.map((arc) =>
    simplifySingleArc(arc, topo.transform, baseTol, smallSpanThreshold)
  );
  const candidate = {
    ...topo,
    arcs: simplifiedArcs,
  };

  const afterPrimary = feature(candidate, candidate.objects[primaryObjectKey]);
  const afterResolvedKeys = new Set(
    afterPrimary.features.map(resolveKey).filter(Boolean)
  );
  const afterStats = collectFeatureStats(afterPrimary);

  if (afterPrimary.features.length !== beforePrimary.features.length) {
    throw new Error(
      `${label}: feature count mismatch (${afterPrimary.features.length} vs ${beforePrimary.features.length})`
    );
  }
  for (const k of beforeResolvedKeys) {
    if (!afterResolvedKeys.has(k)) {
      throw new Error(`${label}: lost resolved feature key "${k}"`);
    }
  }
  if (afterStats.degenerateRings > beforeStats.degenerateRings) {
    throw new Error(
      `${label}: introduced degenerate rings (${afterStats.degenerateRings} vs ${beforeStats.degenerateRings})`
    );
  }

  for (const objKey of secondaryObjectKeys) {
    if (candidate.objects[objKey]) {
      const sec = feature(candidate, candidate.objects[objKey]);
      const secStats = collectFeatureStats(sec);
      if (secStats.degenerateRings > 0) {
        throw new Error(`${label} (${objKey}): degenerate rings detected`);
      }
    }
  }

  const outJson = JSON.stringify(candidate);
  const afterVertices = candidate.arcs.reduce((sum, a) => sum + a.length, 0);
  const afterBytes = Buffer.byteLength(outJson, "utf8");

  fs.writeFileSync(filePath, outJson, "utf8");

  console.log(
    `[OK] ${label}: bytes ${(beforeBytes / 1024).toFixed(1)} KB -> ${(afterBytes / 1024).toFixed(
      1
    )} KB (-${Math.round(((beforeBytes - afterBytes) / beforeBytes) * 100)}%) | vertices ${beforeVertices} -> ${afterVertices} (-${Math.round(
      ((beforeVertices - afterVertices) / beforeVertices) * 100
    )}%) | resolved keys: ${afterResolvedKeys.size}/${beforeResolvedKeys.size} | rings: ${afterStats.totalRings}`
  );
}

const root = process.cwd();

simplifyTopologyFile({
  filePath: path.join(root, "public/world-countries.topo.json"),
  primaryObjectKey: "countries",
  secondaryObjectKeys: ["land"],
  baseTol: 0.048,
  smallSpanThreshold: 1.5,
  resolveKey: (f) => resolveCountryFromFeature(f)?.id ?? null,
  label: "world-countries.topo.json",
});

simplifyTopologyFile({
  filePath: path.join(root, "public/provincias_spain.topo.json"),
  primaryObjectKey: "provincias",
  secondaryObjectKeys: [],
  baseTol: 0.0045,
  smallSpanThreshold: 0.25,
  resolveKey: (f) => {
    const code = f?.properties?.Codigo;
    return code && peakByCode[code] ? code : null;
  },
  label: "provincias_spain.topo.json",
});
