# COL7A1 domain & mutation map

Live: https://col7a1-domain-mutation-map.vercel.app

Repository: https://github.com/theravingrooster/col7a1-domain-mutation-map

A standalone React research explorer built entirely from the local UniProt Q02388 and ClinVar files. Large interactive protein map, domain/range selection, zoom, density view, HGVS hover details, glycine highlighting, searchable filters, variant details, and CSV export of **all filtered results**.

No runtime API, external fonts, analytics, or internet requests. Everything needed is inside this folder. Processing/audit code and installed dependencies were copied from the neighboring local variant explorer; no downloads were made.

## Run

Node.js 22+; Python 3.9+ only for data processing and audits.

```sh
npm run dev          # http://127.0.0.1:3001
npm run build        # static site in dist/
npm test             # 20 automated tests
npm run verify:data  # full comparison against the local source archive
```

The server builds at startup; after edits, rebuild and refresh. On another machine, run `npm ci` first (requires cached packages or network access). `dist/` can also be served using `python3 -m http.server 3001 --directory dist`.

## Snapshot and mapping

Prepared **2026-10-28**. **ClinVar release date is not recorded**; preparation and per-record evaluation dates are not release cutoffs. UniProt annotation update: **2026-09-02**, entry version **260**, sequence version **2**. The snapshot does not update automatically.

- **6,522** distinct VariationIDs from **13,036** COL7A1 rows; assembly duplicates are grouped.
- **4,268** variants map; **2,254** stay searchable without plotted positions (2,252 lack protein HGVS; two have unsupported/out-of-bounds expressions).
- **479** collagenous glycine substitutions. The flag excludes synonymous changes, stop gains, frameshifts, and indels, and is independent of clinical significance.

Coordinates are **1-based, inclusive**, on the complete 2,944-residue precursor:

| Region | Residues |
| --- | --- |
| Signal peptide | 1–16 |
| NC1 | 17–1253 |
| Collagenous / triple-helical | 1254–2784 |
| NC2 | 2785–2944 |

All boundaries and 12 subdomains (two vWA, nine fibronectin III, one BPTI/Kunitz) come directly from UniProt. Mapping requires explicit protein HGVS on locally linked **NM_000094.4 / NP_000085.1**, in-bounds positions, and matching endpoint residues. No genomic/coding-to-protein inference is attempted. Frameshifts map their anchors; truncations map their reported residues. Range filters use interval overlap.

Markers group variants sharing an anchor and classification. Density counts each variant once at its anchor (clamped to the viewport for overlapping intervals). Height is `8 + 8√count`, capped at 39 SVG units. Clinical colors preserve the source classifications, with “likely” grouped into red/green and conflicts separate. Domains are keyboard selectable; the table provides access to every variant. Map/table scroll horizontally on small screens. See **Sources & methods** in the app for details.

## Data and regeneration

- `public/data/domain-map.json`: compact frontend JSON (~3.6 MB), with metadata, sequence, domains, variants, positions, and glycine flags. Unmapped coordinates are `null`.
- `public/data/variants.json`: full normalized records, assembly positions, mapping assessments, source hashes and line numbers.
- `public/data/clinvar-col7a1.tsv`: unchanged matching source rows with provenance.
- `Q02388.json` / `variant_summary.txt.gz`: original local inputs.

Run `npm run data`, `npm run verify:data`, `npm test`, then `npm run build` after replacing inputs. For deterministic reproduction of this snapshot, use `python3 scripts/process_data.py --prepared-date 2026-10-28`. Source/processor SHA-256 hashes are embedded in the JSON. The audit scans all **9,312,744** source rows, compares every matching row, and reproduces every variant.

## Vercel

Deployed to the **Elenchus** Vercel team from GitHub `main`. Use framework **Other**, build command **`npm run build`**, output **`dist`**, Node.js **24** (or supported 22+). Settings are in `vercel.json`; no environment variables are needed. Commit source files, both package files, `Q02388.json`, and `public/data/`. Builds consume processed data and do not need Python or the large ClinVar archive, which is excluded from Git/Vercel uploads.

The repository is connected to Vercel; updates to `main` trigger a production build. The initial upload used the connected GitHub app. Terminal pushes require GitHub CLI/Git authentication on the machine. The original data acquisition and app build used only local files; GitHub publication and Vercel deployment used the connected services.
