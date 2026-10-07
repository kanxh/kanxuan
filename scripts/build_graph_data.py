#!/usr/bin/env python3

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
WIKI_ROOT = Path("/Users/kanxuanhe/Document/Obsidian_Vault/_Wiki")
PAPER_BOARD_PATH = Path("/Users/kanxuanhe/Document/Obsidian_Vault/_Paper Tracker/_PaperBoard.md")
PAPERS_ROOT = Path("/Users/kanxuanhe/Document/Obsidian_Vault/_Paper Tracker/papers")
OUTPUT_PATH = REPO_ROOT / "preview/data/graph-data.json"
OUTPUT_JS_PATH = REPO_ROOT / "preview/data/graph-data.js"

CLUSTERS = {
    "climate": {
        "label": "Climate",
        "color": "#54788c",
        "description": "Climate regimes, shifts, weather files, and future scenarios.",
    },
    "thermal-comfort": {
        "label": "Thermal Comfort",
        "color": "#b26e54",
        "description": "Thermal sensation, MRT, UTCI, and risk objects tied to comfort.",
    },
    "energy": {
        "label": "Energy",
        "color": "#7c8d53",
        "description": "Building energy simulation, performance objects, and system framing.",
    },
    "statistics": {
        "label": "Statistics",
        "color": "#8b7194",
        "description": "Probabilistic models, clustering, extremes, and statistical transformations.",
    },
    "machine-learning": {
        "label": "Machine Learning",
        "color": "#c2863f",
        "description": "Non-deep-learning predictive or representation methods.",
    },
    "deep-learning": {
        "label": "Deep Learning",
        "color": "#9a5f73",
        "description": "Neural-network-based methods and representation learning.",
    },
    "llm": {
        "label": "LLM",
        "color": "#4f7d72",
        "description": "Large-language-model based tools and workflows.",
    },
    "urban-systems": {
        "label": "Urban Systems",
        "color": "#6a647f",
        "description": "Placeholder project cluster for urban interfaces and spatial systems.",
    },
    "frontier": {
        "label": "Frontier",
        "color": "#8a7c68",
        "description": "Published work not yet anchored by the current wiki keyword layer.",
    },
}

PROJECT_PLACEHOLDERS = [
    {
        "label": "StreetDAO",
        "year": 2026,
        "summary": "Project placeholder for a civic coordination and neighborhood-level urban systems thread.",
        "href": None,
        "keywords": ["Civic coordination", "Urban systems"],
    },
    {
        "label": "Pixcity",
        "year": 2026,
        "summary": "Project placeholder for spatial media, playful urban interfaces, and city-scale interaction design.",
        "href": None,
        "keywords": ["Spatial media", "Urban systems"],
    },
    {
        "label": "Urban Design Competition with 100 Modular Moving Spaces",
        "year": 2026,
        "summary": "Project placeholder for modular urbanism, adaptive public space, and moving-space design experiments.",
        "href": None,
        "keywords": ["Modular urbanism", "Urban systems"],
    },
]

PROJECT_KEYWORDS = [
    {
        "label": "Urban systems",
        "summary": "A placeholder keyword hub for projects that are not yet modeled in the current research wiki.",
    },
    {
        "label": "Civic coordination",
        "summary": "Placeholder keyword for decentralized urban organization and civic tooling projects.",
    },
    {
        "label": "Spatial media",
        "summary": "Placeholder keyword for visual, playful, or media-driven urban interfaces.",
    },
    {
        "label": "Modular urbanism",
        "summary": "Placeholder keyword for adaptive space-making, modular interventions, and moving-space systems.",
    },
]

PUBLISHED_PAPER_PATTERN = re.compile(r"- \[x\] \[\[([^\]]+)\]\] @\{(\d{4})-(\d{2})-(\d{2})\}")
WIKILINK_PATTERN = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]")
ACRONYM_PATTERN = re.compile(r"\(([A-Za-z0-9 ._-]{2,})\)")

PAPER_TITLE_OVERRIDES = {
    "climate zone_IAQVEC": "Data-driven cross-regional climate zone classification for building codes: a future-compatible framework",
    "Gehl_webcam": "Revisiting Gehl's urban design principles with computer vision and webcam data: Associations between public space and public life",
    "CO-build_ICML": "A Temporal Features-Enhanced Mixture-of-Experts Approach for Indoor Temperature Prediction",
    "UrbanAI_NeurIPS": "Multi-Band Fusion Framework Using Hybrid Predictors for Indoor Temperature Forecasting",
    "PINN": "Physics-Informed Neural Networks for robust thermal comfort prediction: Overcoming data quality limitations through physiological constraints",
    "CO-Simulation": "A co-simulation methodology for integrating data-driven thermal sensation models with building energy control",
    "sAMY 1.0": "Scenario-Conditioned Actual Meteorological Years (sAMY): A Stochastic Weather Generator Using Multi-Decadal Observations",
    "sAMY 2.0": "Input quality, not statistical complexity, determines climate-adapted weather file fidelity: A causal decomposition of degree-day errors",
}


def slugify(value: str) -> str:
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", value.lower())).strip("-")


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def strip_quotes(value: str) -> str:
    return value.strip().strip('"').strip("'")


def parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---\n"):
        return {}, text

    parts = text.split("\n---\n", 1)
    if len(parts) != 2:
        return {}, text

    raw_meta, body = parts
    lines = raw_meta.splitlines()[1:]
    meta: dict[str, object] = {}
    current_key: str | None = None

    for line in lines:
        if not line.strip():
            continue

        match = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if match:
            key, raw_value = match.groups()
            value = strip_quotes(raw_value)
            if value:
                meta[key] = value
                current_key = None
            else:
                meta[key] = []
                current_key = key
            continue

        list_match = re.match(r"^\s*-\s+(.*)$", line)
        if list_match and current_key:
            if not isinstance(meta[current_key], list):
                meta[current_key] = [meta[current_key]]
            meta[current_key].append(strip_quotes(list_match.group(1)))

    return meta, body


def extract_markdown_title(body: str) -> str | None:
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if line.startswith("# "):
            return line[2:].strip()
    return None


def resolve_paper_title(name: str, meta: dict, body: str) -> str:
    if name in PAPER_TITLE_OVERRIDES:
        return PAPER_TITLE_OVERRIDES[name]

    title = meta.get("title")
    if isinstance(title, str) and title.strip():
        return strip_quotes(title)

    heading = extract_markdown_title(body)
    if heading:
        return heading

    return re.sub(r"\s+", " ", name.replace("_", " ")).strip()


def extract_summary(body: str) -> str:
    trimmed = body.split("\n> [!related]", 1)[0]
    paragraphs: list[str] = []
    current: list[str] = []

    for raw_line in trimmed.splitlines():
        line = raw_line.strip()
        if not line:
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        if line.startswith("#") or line.startswith(">") or line.startswith("```") or line.startswith("$$"):
            if current:
                paragraphs.append(" ".join(current))
            break
        current.append(line)

    if current:
        paragraphs.append(" ".join(current))

    return paragraphs[0] if paragraphs else ""


def extract_section_links(body: str, label: str) -> list[str]:
    pattern = re.compile(rf"^> {re.escape(label)}:\s*(.+)$", re.MULTILINE)
    matches = pattern.findall(body)
    links: list[str] = []
    for match in matches:
        links.extend(WIKILINK_PATTERN.findall(match))
    return links


def parse_published_papers(board_text: str) -> list[dict]:
    published_block_match = re.search(
        r"## 🟢 Published\s+.*?(?=\n## |\n\*\*\*|\Z)",
        board_text,
        re.DOTALL,
    )
    if not published_block_match:
        return []

    published_block = published_block_match.group(0)
    papers = []
    for name, year, month, day in PUBLISHED_PAPER_PATTERN.findall(published_block):
        date = f"{year}-{month}-{day}"
        papers.append({"name": name, "date": date, "year": int(year)})
    return papers


def majority_cluster(keyword_ids: list[str], keyword_nodes: dict[str, dict]) -> str:
    if not keyword_ids:
        return "frontier"

    topic_ids = [keyword_id for keyword_id in keyword_ids if keyword_nodes[keyword_id].get("metaType") == "topic"]
    source_ids = topic_ids or keyword_ids
    cluster_counts = Counter(keyword_nodes[keyword_id]["cluster"] for keyword_id in source_ids)
    return cluster_counts.most_common(1)[0][0]


def prioritized_keyword_labels(keyword_ids: list[str], nodes: dict[str, dict], limit: int = 3) -> list[str]:
    ordered = sorted(
        keyword_ids,
        key=lambda keyword_id: (
            0 if nodes[keyword_id].get("metaType") == "topic" else 1,
            nodes[keyword_id]["label"].lower(),
        ),
    )
    return [nodes[keyword_id]["label"] for keyword_id in ordered[:limit]]


def edge_key(source: str, target: str, relation: str) -> tuple[str, str, str]:
    left, right = sorted([source, target])
    return left, right, relation


def add_edge(
    edges: dict[tuple[str, str, str], dict],
    source: str,
    target: str,
    relation: str,
    strength: float,
) -> None:
    if source == target:
        return
    key = edge_key(source, target, relation)
    if key in edges:
        edges[key]["strength"] = max(edges[key]["strength"], strength)
        return
    edges[key] = {
        "source": source,
        "target": target,
        "relation": relation,
        "strength": strength,
    }


def keyword_id_for(label: str) -> str:
    return f"kw:{slugify(label)}"


def anchor_id_for(kind: str, label: str) -> str:
    return f"{kind}:{slugify(label)}"


def read_paper_notes() -> dict[str, dict]:
    notes: dict[str, dict] = {}
    for note_path in sorted(PAPERS_ROOT.glob("*.md")):
        meta, body = parse_frontmatter(note_path.read_text(encoding="utf-8"))
        notes[note_path.stem] = {
            "meta": meta,
            "body": body,
            "path": note_path,
        }
    return notes


def build_keyword_nodes() -> tuple[dict[str, dict], list[dict], dict[str, list[str]], dict[str, str], dict]:
    keyword_nodes: dict[str, dict] = {}
    edges: dict[tuple[str, str, str], dict] = {}
    paper_links_by_name: dict[str, list[str]] = defaultdict(list)
    alias_map: dict[str, str] = {}
    keyword_connections: dict[str, list[str]] = defaultdict(list)

    wiki_files = sorted((WIKI_ROOT / "topics").glob("*.md")) + sorted((WIKI_ROOT / "methods").glob("*.md"))

    raw_records = []
    for wiki_path in wiki_files:
        label = wiki_path.stem
        meta, body = parse_frontmatter(wiki_path.read_text(encoding="utf-8"))
        node_id = keyword_id_for(label)
        cluster_candidates = meta.get("hyper_tags") or []
        if isinstance(cluster_candidates, str):
            cluster_candidates = [cluster_candidates]
        cluster = cluster_candidates[0] if cluster_candidates else ("statistics" if "methods" in wiki_path.parts else "climate")
        tags = meta.get("tags") or []
        if isinstance(tags, str):
            tags = [tags]
        summary = extract_summary(body)
        wiki_links = extract_section_links(body, "Wiki")
        paper_links = extract_section_links(body, "Papers")
        raw_records.append(
            {
                "id": node_id,
                "label": label,
                "cluster": cluster,
                "summary": summary,
                "tags": tags,
                "wiki_links": wiki_links,
                "paper_links": paper_links,
                "type": meta.get("type", "topic"),
            }
        )

    label_to_id = {record["label"]: record["id"] for record in raw_records}

    for record in raw_records:
        keyword_nodes[record["id"]] = {
            "id": record["id"],
            "label": record["label"],
            "type": "keyword",
            "kind": None,
            "cluster": record["cluster"],
            "summary": record["summary"],
            "href": None,
            "tags": record["tags"],
            "weight": 1,
            "metaType": record["type"],
        }

        alias_map[normalize(record["label"])] = record["id"]
        acronym_match = ACRONYM_PATTERN.search(record["label"])
        if acronym_match:
            alias_map[normalize(acronym_match.group(1))] = record["id"]

        for linked_keyword in record["wiki_links"]:
            target_id = label_to_id.get(linked_keyword)
            if target_id:
                add_edge(edges, record["id"], target_id, "keyword", 0.4)
                keyword_connections[record["id"]].append(target_id)

        for paper_name in record["paper_links"]:
            paper_links_by_name[paper_name].append(record["id"])

    return keyword_nodes, list(edges.values()), paper_links_by_name, alias_map, keyword_connections


def add_project_placeholders(
    nodes: dict[str, dict],
    edge_store: dict[tuple[str, str, str], dict],
) -> None:
    for keyword in PROJECT_KEYWORDS:
        node_id = keyword_id_for(keyword["label"])
        nodes[node_id] = {
            "id": node_id,
            "label": keyword["label"],
            "type": "keyword",
            "kind": None,
            "cluster": "urban-systems",
            "summary": keyword["summary"],
            "href": None,
            "tags": ["placeholder", "urban-systems"],
            "weight": 1,
            "metaType": "placeholder",
        }

    hub_id = keyword_id_for("Urban systems")
    for child in ["Civic coordination", "Spatial media", "Modular urbanism"]:
        add_edge(edge_store, hub_id, keyword_id_for(child), "keyword", 0.3)

    for project in PROJECT_PLACEHOLDERS:
        node_id = anchor_id_for("project", project["label"])
        nodes[node_id] = {
            "id": node_id,
            "label": project["label"],
            "sourceLabel": project["label"],
            "type": "anchor",
            "kind": "project",
            "cluster": "urban-systems",
            "year": project["year"],
            "summary": project["summary"],
            "href": project["href"],
            "tags": ["placeholder", "project"],
            "weight": 2.2,
        }
        for keyword_label in project["keywords"]:
            add_edge(edge_store, node_id, keyword_id_for(keyword_label), "project", 1.0)


def build_graph() -> dict:
    board_text = PAPER_BOARD_PATH.read_text(encoding="utf-8")
    published_papers = parse_published_papers(board_text)
    paper_notes = read_paper_notes()

    keyword_nodes, keyword_edges, paper_links_by_name, alias_map, keyword_connections = build_keyword_nodes()
    nodes: dict[str, dict] = dict(keyword_nodes)
    edge_store: dict[tuple[str, str, str], dict] = {}

    for edge in keyword_edges:
        add_edge(edge_store, edge["source"], edge["target"], edge["relation"], edge["strength"])

    frontier_keyword_id = keyword_id_for("Research frontier")
    nodes[frontier_keyword_id] = {
        "id": frontier_keyword_id,
        "label": "Research frontier",
        "type": "keyword",
        "kind": None,
        "cluster": "frontier",
        "summary": "A holding keyword for published papers that are not yet anchored by the current wiki keyword layer.",
        "href": None,
        "tags": ["placeholder", "frontier"],
        "weight": 1,
        "metaType": "placeholder",
    }

    unmapped_papers: list[str] = []
    mapped_papers: list[str] = []

    for published in published_papers:
        name = published["name"]
        note = paper_notes.get(name, {})
        meta = note.get("meta", {})
        body = str(note.get("body", ""))
        venue = strip_quotes(str(meta.get("venue", ""))) if meta else ""
        href = meta.get("link") if meta else None
        href = href if isinstance(href, str) and href.startswith(("http://", "https://")) else None
        display_title = resolve_paper_title(name, meta, body)

        related_keyword_ids = list(dict.fromkeys(paper_links_by_name.get(name, [])))
        if not related_keyword_ids:
            alias_target = alias_map.get(normalize(name))
            if alias_target:
                related_keyword_ids = [alias_target]

        if related_keyword_ids:
            cluster = majority_cluster(related_keyword_ids, keyword_nodes)
            mapped_papers.append(name)
        else:
            cluster = "frontier"
            related_keyword_ids = [frontier_keyword_id]
            unmapped_papers.append(name)

        summary_parts = []
        if venue:
            summary_parts.append(f"Published at {venue}.")
        if cluster == "frontier":
            summary_parts.append("Current wiki does not yet provide a reliable keyword anchor for this paper.")
        else:
            labels = prioritized_keyword_labels(related_keyword_ids, nodes)
            summary_parts.append(f"Anchored through {', '.join(labels)}.")

        node_id = anchor_id_for("paper", name)
        nodes[node_id] = {
            "id": node_id,
            "label": display_title,
            "sourceLabel": name,
            "type": "anchor",
            "kind": "paper",
            "cluster": cluster,
            "year": published["year"],
            "summary": " ".join(summary_parts).strip(),
            "href": href,
            "tags": ["paper", cluster],
            "weight": 2.4,
            "publishedDate": published["date"],
        }

        for keyword_id in related_keyword_ids:
            add_edge(edge_store, node_id, keyword_id, "paper", 1.1)
            for neighbor_id in keyword_connections.get(keyword_id, [])[:2]:
                add_edge(edge_store, node_id, neighbor_id, "paper-context", 0.2)

    add_project_placeholders(nodes, edge_store)

    # Remove frontier anchor nodes (papers with no wiki keyword anchoring)
    # and clean up any keywords that become isolated as a result.
    frontier_anchor_ids = {
        nid for nid, node in nodes.items()
        if node["type"] == "anchor" and node["cluster"] == "frontier"
    }
    for nid in frontier_anchor_ids:
        del nodes[nid]
    edge_store = {
        k: v for k, v in edge_store.items()
        if v["source"] not in frontier_anchor_ids and v["target"] not in frontier_anchor_ids
    }
    # Drop keyword nodes that are now unreferenced
    referenced_ids = {nid for e in edge_store.values() for nid in (e["source"], e["target"])}
    isolated_keywords = {
        nid for nid, node in nodes.items()
        if node["type"] == "keyword" and nid not in referenced_ids
    }
    for nid in isolated_keywords:
        del nodes[nid]

    degree_counter: Counter = Counter()
    for edge in edge_store.values():
        degree_counter[edge["source"]] += 1
        degree_counter[edge["target"]] += 1

    for node in nodes.values():
        degree = degree_counter[node["id"]]
        if node["type"] == "keyword":
            node["weight"] = round(0.9 + min(degree, 8) * 0.18, 2)
        else:
            node["weight"] = round(node["weight"] + min(degree, 5) * 0.1, 2)

    years = sorted({node["year"] for node in nodes.values() if isinstance(node.get("year"), int)})
    stats = {
        "keywords": sum(1 for node in nodes.values() if node["type"] == "keyword"),
        "papers": sum(1 for node in nodes.values() if node["kind"] == "paper"),
        "projects": sum(1 for node in nodes.values() if node["kind"] == "project"),
        "mappedPapers": len(mapped_papers),
        "unmappedPapers": len(unmapped_papers),
        "clusters": len({node["cluster"] for node in nodes.values()}),
        "timeRange": [years[0], years[-1]] if years else [],
    }

    graph = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "source": {
            "wiki": str(WIKI_ROOT),
            "paperBoard": str(PAPER_BOARD_PATH),
            "papersRoot": str(PAPERS_ROOT),
        },
        "clusters": CLUSTERS,
        "timelineYears": years,
        "stats": stats,
        "notes": {
            "mappingPolicy": "Wiki pages are normalized into keyword nodes. Published papers come from _PaperBoard.md and are anchored through explicit Papers links in _Wiki when available. Remaining papers fall into a frontier holding cluster. Projects are phase-one placeholders.",
            "unmappedPapers": unmapped_papers,
        },
        "snapshot": {
            "nodes": sorted(nodes.values(), key=lambda node: (node["type"], node["cluster"], node["label"].lower())),
            "edges": sorted(edge_store.values(), key=lambda edge: (edge["relation"], edge["source"], edge["target"])),
        },
    }
    return graph


def main() -> None:
    graph = build_graph()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(graph, ensure_ascii=False, indent=2), encoding="utf-8")
    OUTPUT_JS_PATH.write_text(
        f"window.__GRAPH_DATA__ = {json.dumps(graph, ensure_ascii=False, indent=2)};\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_PATH}")
    print(f"Wrote {OUTPUT_JS_PATH}")
    print(json.dumps(graph["stats"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
