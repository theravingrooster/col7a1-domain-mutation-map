import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { GROUPS, groupMarkers, format } from '../src/data-utils.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = await mkdtemp(path.join(tmpdir(), 'col7a1-map-render-'));
after(() => rm(scratch, { recursive: true, force: true }));
const output = path.join(scratch, 'render.cjs');
await build({
  stdin: {
    contents: `import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import ProteinMap from './src/ProteinMap.jsx';
      export const render = props => renderToStaticMarkup(React.createElement(ProteinMap, props));`,
    resolveDir: root,
    sourcefile: 'map-ssr-check.jsx',
    loader: 'jsx',
  },
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
});
const { render } = createRequire(import.meta.url)(output);
const data = JSON.parse(await readFile(new URL('../public/data/domain-map.json', import.meta.url), 'utf8'));
const noop = () => {};
const base = {
  data, variants: data.variants, selection: null,
  setSelection: noop, view: { start: 1, end: data.protein.length },
  setView: noop, onInspect: noop, mode: 'variants', setMode: noop,
};

function svgFrom(html) {
  const svg = html.match(/<svg\b[\s\S]*?<\/svg>/)?.[0];
  assert.ok(svg, 'The map remains a vector SVG, including for exports');
  return svg;
}

for (const mode of ['variants', 'density']) {
  test(`${mode} map renders all mapped records with a bounded SVG tree`, () => {
    const html = render({ ...base, mode });
    const svg = svgFrom(html);
    const descendantCount = (svg.match(/<[A-Za-z][^>]*>/g)?.length ?? 1) - 1;
    assert.ok(descendantCount < 300,
      `Expected fewer than 300 SVG descendants, got ${descendantCount}; per-marker DOM causes hover lag`);
    assert.match(html, /<strong>4,268<\/strong>\s*mapped variants in view/);
    for (const group of GROUPS) assert.ok(svg.includes(group.short), `Missing ${group.short} lane`);
    for (const domain of data.domains) {
      assert.ok(svg.includes(`Select ${domain.label}, residues ${domain.start} to ${domain.end}`),
        `Missing keyboard-accessible ${domain.label} domain`);
    }
    assert.ok((svg.match(/<path\b/g)?.length ?? 0) > 5, 'The SVG contains plotted vector layers');
    assert.doesNotMatch(svg, /(?:NaN|Infinity)/);
  });
}

test('empty and one-residue maps stay valid and report their actual mapped count', () => {
  for (const mode of ['variants', 'density']) {
    const empty = render({ ...base, mode, variants: [] });
    assert.match(empty, /<strong>0<\/strong>\s*mapped variants in view/);
    assert.doesNotMatch(svgFrom(empty), /(?:NaN|Infinity)/);
    const view = { start: 2575, end: 2575 };
    const expected = groupMarkers(data.variants, view, mode).markers.reduce((n, m) => n + m.variants.length, 0);
    assert.ok(expected > 0);
    const singleton = render({ ...base, mode, view });
    assert.ok(singleton.includes(`<strong>${format(expected)}</strong> mapped variants in view`));
    assert.doesNotMatch(svgFrom(singleton), /(?:NaN|Infinity)/);
    assert.match(singleton, /Full protein/);
  }
});
