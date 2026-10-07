# Kanxuan He — research site

Astro static site with four pages: Home, Research, About, and Contact. The interactive research map is an SVG and native JavaScript enhancement; the full map relationships are also available in an HTML disclosure list.

```sh
npm install
npm run dev
npm run build
```

## Content sources

- `src/data/publications.json` is a public metadata snapshot of the nine non-attachment records in the local Zotero `_MyPaper` collection, read on 2026-10-07. It contains selected public fields only. An OpenReview URL was reduced to its canonical forum ID to remove a referrer parameter. The build never connects to Zotero.
- `src/data/research.js` contains manually edited summaries, project descriptions, network positions, and the reasons for each connection. Its topic and method vocabulary is a curated subset of the local Obsidian `_Wiki`, not an export of internal notes. Publications are linked by Zotero item key.
- The Latent Space and StreetDAO descriptions and education/work background were checked against a local CV source. That CV is not included in the repository or copied to the built site.

Publication metadata follows the source record. In particular, the publisher and Zotero record spell “termal” in the co-simulation title. Dates in the catalog display year only, since one collection item has a year without a full publication date. The site uses DOI links where available and stable OpenReview forum links for workshop papers.

The earlier `preview/` and `scripts/build_graph_data.py` are preserved as reference material. They are not imported by the Astro site and contain placeholders and local Obsidian paths unsuitable for public output.
