import Graph from "https://esm.sh/graphology?bundle";
import Sigma from "https://esm.sh/sigma?bundle";
import forceAtlas2 from "https://esm.sh/graphology-layout-forceatlas2?bundle";

const graphContainer = document.getElementById("graph-canvas");

const controls = {
  view: [...document.querySelectorAll("[data-view]")],
  clusterLegend: document.getElementById("cluster-legend"),
  clustersBlock: document.getElementById("clusters-block"),
  focusPill: document.getElementById("focus-pill"),
};

const timeline = {
  slider: document.getElementById("timeline-slider"),
  year: document.getElementById("timeline-year"),
  ticks: document.getElementById("timeline-ticks"),
};

const detail = {
  panel: document.getElementById("detail-panel"),
  close: document.getElementById("panel-close"),
  kicker: document.getElementById("panel-kicker"),
  title: document.getElementById("panel-title"),
  summary: document.getElementById("panel-summary"),
  cluster: document.getElementById("panel-cluster"),
  type: document.getElementById("panel-type"),
  year: document.getElementById("panel-year"),
  relatedCount: document.getElementById("panel-related-count"),
  related: document.getElementById("panel-related"),
  link: document.getElementById("panel-link"),
};

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  viewMode: "all",
  activeCluster: null,
  selectedYear: null,
  hoverNodeId: null,
  lockedNodeId: null,
  panelHovering: false,
  rawData: null,
  graph: null,
  sigma: null,
  adjacency: new Map(),
  visibleNodeIds: new Set(),
  highlightedNodeIds: new Set(),
  highlightedEdgeKeys: new Set(),
  hoverClearTimer: null,
};

const clusterOrder = [
  "climate",
  "thermal-comfort",
  "energy",
  "statistics",
  "machine-learning",
  "deep-learning",
  "llm",
  "urban-systems",
  "frontier",
];

const clusterTargets = new Map([
  ["frontier", { x: 0.18, y: 0.2 }],
  ["urban-systems", { x: 0.16, y: 0.48 }],
  ["llm", { x: 0.28, y: 0.8 }],
  ["deep-learning", { x: 0.42, y: 0.7 }],
  ["statistics", { x: 0.48, y: 0.24 }],
  ["climate", { x: 0.66, y: 0.26 }],
  ["thermal-comfort", { x: 0.84, y: 0.38 }],
  ["energy", { x: 0.74, y: 0.74 }],
  ["machine-learning", { x: 0.9, y: 0.58 }],
]);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setButtonGroup(activeValue, buttons, key) {
  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset[key] === activeValue);
  });
}

function clusterLabel(clusterKey) {
  return state.rawData.clusters[clusterKey]?.label || clusterKey;
}

function typeLabel(node) {
  if (node.kind === "paper") return "Paper";
  if (node.kind === "project") return "Project";
  return node.metaType === "method" ? "Method keyword" : "Keyword";
}

function nodeCategory(node) {
  return node.nodeCategory || node.type;
}

function activeNodeId() {
  return state.lockedNodeId || state.hoverNodeId;
}

function visibleAnchor(node) {
  if (nodeCategory(node) !== "anchor") return false;
  if (!state.selectedYear) return true;
  return !node.year || node.year <= state.selectedYear;
}

function nodeIsVisible(nodeId) {
  return state.visibleNodeIds.has(nodeId);
}

function neighborsFor(nodeId) {
  return [...(state.adjacency.get(nodeId) || new Set())]
    .map((id) => state.rawData.snapshot.nodes.find((node) => node.id === id))
    .filter(Boolean)
    .sort((left, right) => {
      if (nodeCategory(left) !== nodeCategory(right)) return nodeCategory(left) === "anchor" ? -1 : 1;
      return left.label.localeCompare(right.label);
    });
}

function truncateLabel(label, maxLength) {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function buildAdjacency() {
  const adjacency = new Map();
  state.rawData.snapshot.nodes.forEach((node) => adjacency.set(node.id, new Set()));
  state.rawData.snapshot.edges.forEach((edge) => {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  });
  state.adjacency = adjacency;
}

function seededPosition(node, index) {
  const target = clusterTargets.get(node.cluster) || { x: 0.5, y: 0.5 };
  const angle = ((index * 47) % 360) * (Math.PI / 180);
  const radius = 0.06 + ((index * 17) % 80) / 500;
  return {
    x: target.x + (Math.cos(angle) * radius),
    y: target.y + (Math.sin(angle) * radius),
  };
}

function createGraph() {
  const graph = new Graph({ multi: true });
  state.rawData.snapshot.nodes.forEach((node, index) => {
    const { x, y } = seededPosition(node, index + 1);
    const cluster = state.rawData.clusters[node.cluster];
    graph.addNode(node.id, {
      ...node,
      nodeCategory: node.type,
      type: "circle",
      x,
      y,
      size: node.type === "anchor"
        ? (node.kind === "project" ? 7.5 : 8.8) + (node.weight || 1) * 1.2
        : 2.6 + (node.weight || 1) * 0.8,
      color: cluster?.color || "#81786f",
      label: node.label,
      fullLabel: node.label,
      sourceLabel: node.sourceLabel || node.label,
    });
  });

  state.rawData.snapshot.edges.forEach((edge, index) => {
    graph.addEdgeWithKey(`edge-${index}`, edge.source, edge.target, {
      ...edge,
      size: edge.relation === "keyword" ? 0.55 : 0.85,
      color: "rgba(54, 45, 39, 0.14)",
    });
  });

  return graph;
}

function spreadClusters(graph) {
  const centroids = new Map();
  const counts = new Map();

  graph.forEachNode((nodeId, attrs) => {
    const current = centroids.get(attrs.cluster) || { x: 0, y: 0 };
    current.x += attrs.x;
    current.y += attrs.y;
    centroids.set(attrs.cluster, current);
    counts.set(attrs.cluster, (counts.get(attrs.cluster) || 0) + 1);
  });

  centroids.forEach((value, clusterKey) => {
    value.x /= counts.get(clusterKey);
    value.y /= counts.get(clusterKey);
  });

  graph.forEachNode((nodeId, attrs) => {
    const target = clusterTargets.get(attrs.cluster) || { x: 0.5, y: 0.5 };
    const centroid = centroids.get(attrs.cluster) || { x: attrs.x, y: attrs.y };
    const movedX = attrs.x + ((target.x - centroid.x) * 1.2);
    const movedY = attrs.y + ((target.y - centroid.y) * 1.1);
    graph.setNodeAttribute(nodeId, "x", movedX);
    graph.setNodeAttribute(nodeId, "y", movedY);
  });
}

function normalizeGraph(graph) {
  const xs = [];
  const ys = [];
  graph.forEachNode((_, attrs) => { xs.push(attrs.x); ys.push(attrs.y); });
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);

  // Use 5th–95th percentile bounds to prevent outlier stretch
  const pLow = Math.floor(xs.length * 0.05);
  const pHigh = Math.ceil(xs.length * 0.95) - 1;
  const minX = xs[pLow];
  const maxX = xs[Math.min(pHigh, xs.length - 1)];
  const minY = ys[pLow];
  const maxY = ys[Math.min(pHigh, ys.length - 1)];

  const width = Math.max(maxX - minX, 0.001);
  const height = Math.max(maxY - minY, 0.001);

  graph.forEachNode((nodeId, attrs) => {
    const nx = clamp((attrs.x - minX) / width, 0, 1);
    const ny = clamp((attrs.y - minY) / height, 0, 1);
    graph.mergeNodeAttributes(nodeId, {
      x: (nx * 2.4) - 1.2,
      y: (ny * 1.7) - 0.85,
    });
  });
}

function buildLayout() {
  const graph = createGraph();
  const settings = forceAtlas2.inferSettings(graph);
  forceAtlas2.assign(graph, {
    iterations: prefersReducedMotion ? 60 : 220,
    settings: {
      ...settings,
      gravity: 0.06,
      scalingRatio: 16,
      strongGravityMode: false,
      slowDown: 2.0,
      barnesHutOptimize: false,
    },
  });
  spreadClusters(graph);
  normalizeGraph(graph);
  state.graph = graph;
}

function updateClustersVisibility() {
  controls.clustersBlock.classList.toggle("hidden", state.viewMode !== "cluster");
  if (state.viewMode !== "cluster") state.activeCluster = null;
  updateLegendActiveState();
}

function renderLegend() {
  const counts = new Map();
  state.rawData.snapshot.nodes.forEach((node) => {
    counts.set(node.cluster, (counts.get(node.cluster) || 0) + 1);
  });

  const fragment = document.createDocumentFragment();
  clusterOrder
    .filter((clusterKey) => state.rawData.clusters[clusterKey] && counts.has(clusterKey))
    .forEach((clusterKey) => {
      const cluster = state.rawData.clusters[clusterKey];
      const item = document.createElement("button");
      item.type = "button";
      item.className = "legend-item";
      item.dataset.cluster = clusterKey;
      item.innerHTML = `
        <span class="legend-swatch" style="background:${cluster.color}"></span>
        <span class="legend-name">${cluster.label}</span>
        <span class="legend-count">${counts.get(clusterKey)}</span>
        <span class="legend-arrow">›</span>
      `;
      item.addEventListener("click", () => {
        state.activeCluster = state.activeCluster === clusterKey ? null : clusterKey;
        updateLegendActiveState();
        updateHighlight();
        updateDetail();
        refreshRenderer();
      });
      fragment.appendChild(item);
    });

  controls.clusterLegend.innerHTML = "";
  controls.clusterLegend.appendChild(fragment);
  updateLegendActiveState();
}

function updateLegendActiveState() {
  document.querySelectorAll(".legend-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.cluster === state.activeCluster);
  });
}

function updateHighlight() {
  const focusId = activeNodeId();
  state.highlightedNodeIds = new Set();
  state.highlightedEdgeKeys = new Set();

  if (focusId) {
    state.highlightedNodeIds.add(focusId);
    const neighbors = state.adjacency.get(focusId) || new Set();
    neighbors.forEach((neighborId) => state.highlightedNodeIds.add(neighborId));

    state.rawData.snapshot.edges.forEach((edge) => {
      if (edge.source === focusId || edge.target === focusId) {
        state.highlightedEdgeKeys.add(`${edge.source}|${edge.target}`);
        state.highlightedEdgeKeys.add(`${edge.target}|${edge.source}`);
      }
    });
    return;
  }

  if (state.viewMode === "cluster" && state.activeCluster) {
    state.graph.forEachNode((nodeId, attrs) => {
      if (attrs.cluster === state.activeCluster) state.highlightedNodeIds.add(nodeId);
    });

    state.rawData.snapshot.edges.forEach((edge) => {
      const sourceCluster = state.graph.getNodeAttribute(edge.source, "cluster");
      const targetCluster = state.graph.getNodeAttribute(edge.target, "cluster");
      if (sourceCluster === state.activeCluster || targetCluster === state.activeCluster) {
        state.highlightedEdgeKeys.add(`${edge.source}|${edge.target}`);
        state.highlightedEdgeKeys.add(`${edge.target}|${edge.source}`);
      }
    });
  }
}

function updateVisibility() {
  const visible = new Set();
  state.graph.forEachNode((nodeId, attrs) => {
    if (nodeCategory(attrs) === "anchor") {
      if (visibleAnchor(attrs)) visible.add(nodeId);
      return;
    }
    visible.add(nodeId);
  });

  if (state.lockedNodeId && !visible.has(state.lockedNodeId)) state.lockedNodeId = null;
  if (state.hoverNodeId && !visible.has(state.hoverNodeId)) state.hoverNodeId = null;

  state.visibleNodeIds = visible;
  updateHighlight();
  updateDetail();
  refreshRenderer();
}

function updateDetail() {
  const nodeId = activeNodeId();
  if (!nodeId) {
    detail.panel.classList.remove("is-active");
    detail.related.innerHTML = "";
    detail.link.classList.add("hidden");
    controls.focusPill.textContent = state.activeCluster && state.viewMode === "cluster"
      ? clusterLabel(state.activeCluster)
      : "Full graph";
    return;
  }

  const node = state.graph.getNodeAttributes(nodeId);
  const related = neighborsFor(nodeId);
  detail.kicker.textContent = typeLabel(node);
  detail.title.textContent = node.fullLabel;
  detail.summary.textContent = node.summary || "No summary available yet.";
  detail.cluster.textContent = clusterLabel(node.cluster);
  detail.type.textContent = typeLabel(node);
  detail.year.textContent = node.year ? String(node.year) : "—";
  detail.relatedCount.textContent = String(related.length);
  detail.related.innerHTML = "";

  related.forEach((relatedNode) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "related-item";
    item.innerHTML = `<strong>${relatedNode.label}</strong><span>${typeLabel(relatedNode)}</span>`;
    item.addEventListener("click", () => {
      state.lockedNodeId = relatedNode.id;
      state.hoverNodeId = relatedNode.id;
      updateHighlight();
      updateDetail();
      refreshRenderer();
    });
    detail.related.appendChild(item);
  });

  if (node.href) {
    detail.link.href = node.href;
    detail.link.classList.remove("hidden");
  } else {
    detail.link.classList.add("hidden");
  }

  detail.panel.classList.add("is-active");
  controls.focusPill.textContent = node.fullLabel;
}

function renderTimeline() {
  const years = state.rawData.timelineYears;
  timeline.slider.min = "0";
  timeline.slider.max = String(Math.max(years.length - 1, 0));
  timeline.slider.value = String(years.indexOf(state.selectedYear));
  timeline.year.textContent = state.selectedYear ? String(state.selectedYear) : "—";
  timeline.ticks.innerHTML = years.map((year) => `<span>${year}</span>`).join("");
}

function nodeDisplayData(nodeId, data) {
  if (!nodeIsVisible(nodeId)) {
    return { ...data, hidden: true };
  }

  const focusId = activeNodeId();
  const isFocus = focusId === nodeId;
  const inFocusNeighborhood = state.highlightedNodeIds.has(nodeId);
  const inCluster = state.activeCluster && data.cluster === state.activeCluster;

  let color = data.color;
  let size = data.size;
  let label = "";
  let forceLabel = false;
  let zIndex = 0;

  if (focusId) {
    if (inFocusNeighborhood) {
      forceLabel = true;
      label = truncateLabel(data.fullLabel, nodeCategory(data) === "anchor" ? 34 : 22);
      zIndex = isFocus ? 2 : 1;
    } else {
      color = `${data.color}24`;
      size *= 0.82;
    }
  } else if (state.viewMode === "cluster" && state.activeCluster) {
    if (inCluster && nodeCategory(data) === "anchor") {
      label = truncateLabel(data.fullLabel, 32);
      forceLabel = true;
      zIndex = 1;
    } else if (!inCluster) {
      color = `${data.color}30`;
      size *= 0.78;
    }
  } else if (nodeCategory(data) === "anchor" && (data.weight || 0) >= 2.6) {
    label = truncateLabel(data.fullLabel, 30);
    forceLabel = true;
  }

  if (isFocus) {
    size *= 1.12;
    label = truncateLabel(data.fullLabel, 40);
    forceLabel = true;
  }

  return {
    ...data,
    color,
    size,
    label,
    forceLabel,
    zIndex,
  };
}

function edgeDisplayData(edgeId, data) {
  if (!nodeIsVisible(data.source) || !nodeIsVisible(data.target)) {
    return { ...data, hidden: true };
  }

  const focusId = activeNodeId();
  let color = "rgba(56, 47, 40, 0.11)";
  let hidden = false;
  let size = data.size;

  if (focusId) {
    if (state.highlightedEdgeKeys.has(`${data.source}|${data.target}`)) {
      color = data.relation === "keyword" ? "rgba(49, 43, 38, 0.26)" : "rgba(34, 30, 26, 0.42)";
      size *= 1.3;
    } else {
      color = "rgba(56, 47, 40, 0.03)";
    }
  } else if (state.viewMode === "cluster" && state.activeCluster) {
    if (state.highlightedEdgeKeys.has(`${data.source}|${data.target}`)) {
      color = data.relation === "keyword" ? "rgba(56, 47, 40, 0.16)" : "rgba(41, 35, 31, 0.26)";
    } else {
      color = "rgba(56, 47, 40, 0.03)";
    }
  }

  return {
    ...data,
    hidden,
    color,
    size,
  };
}

function refreshRenderer() {
  if (!state.sigma) return;
  state.sigma.refresh();
}

function clearHoverSoon() {
  window.clearTimeout(state.hoverClearTimer);
  state.hoverClearTimer = window.setTimeout(() => {
    if (state.lockedNodeId || state.panelHovering) return;
    state.hoverNodeId = null;
    updateHighlight();
    updateDetail();
    refreshRenderer();
  }, 90);
}

function bindInteractions() {
  controls.view.forEach((button) => {
    button.addEventListener("click", () => {
      state.viewMode = button.dataset.view;
      setButtonGroup(state.viewMode, controls.view, "view");
      updateClustersVisibility();
      updateHighlight();
      updateDetail();
      refreshRenderer();
    });
  });

  timeline.slider.addEventListener("input", (event) => {
    const index = Number(event.target.value);
    state.selectedYear = state.rawData.timelineYears[index];
    timeline.year.textContent = String(state.selectedYear);
    updateVisibility();
  });

  detail.close.addEventListener("click", () => {
    state.lockedNodeId = null;
    state.hoverNodeId = null;
    updateHighlight();
    updateDetail();
    refreshRenderer();
  });

  detail.panel.addEventListener("mouseenter", () => {
    state.panelHovering = true;
    window.clearTimeout(state.hoverClearTimer);
  });

  detail.panel.addEventListener("mouseleave", () => {
    state.panelHovering = false;
    if (!state.lockedNodeId) clearHoverSoon();
  });

  state.sigma.on("enterNode", ({ node }) => {
    window.clearTimeout(state.hoverClearTimer);
    state.hoverNodeId = node;
    updateHighlight();
    updateDetail();
    refreshRenderer();
  });

  state.sigma.on("leaveNode", () => {
    if (!state.lockedNodeId) clearHoverSoon();
  });

  state.sigma.on("clickNode", ({ node }) => {
    state.lockedNodeId = node;
    state.hoverNodeId = node;
    updateHighlight();
    updateDetail();
    refreshRenderer();
  });

  state.sigma.on("clickStage", () => {
    state.lockedNodeId = null;
    state.hoverNodeId = null;
    updateHighlight();
    updateDetail();
    refreshRenderer();
  });
}

function initRenderer() {
  state.sigma = new Sigma(state.graph, graphContainer, {
    minCameraRatio: 0.3,
    maxCameraRatio: 3.0,
    allowInvalidContainer: true,
    renderLabels: true,
    defaultNodeType: "circle",
    defaultEdgeType: "line",
    labelDensity: 0.07,
    labelGridCellSize: 120,
    labelRenderedSizeThreshold: 8,
    defaultLabelColor: { color: "#2a2420" },
    defaultEdgeColor: "rgba(56, 47, 40, 0.11)",
    defaultNodeColor: "#7b756f",
    nodeReducer: nodeDisplayData,
    edgeReducer: edgeDisplayData,
    zIndex: true,
  });

  fitCamera();
}

function fitCamera() {
  const cam = state.sigma.getCamera();
  const { width, height } = state.sigma.getDimensions();

  // Sigma 2 normalizes raw coords internally: camera (0,0) ≠ graph center.
  // Find what graph point is at canvas center, then shift camera so the
  // graph's own center appears there.
  const centerInGraph = state.sigma.viewportToGraph({ x: width / 2, y: height / 2 });
  const camState = cam.getState();
  const newCx = camState.x - centerInGraph.x;
  const newCy = camState.y - centerInGraph.y;

  // Compute graph bbox viewport span at current camera, then scale ratio to fit.
  const { x: [minX, maxX], y: [minY, maxY] } = state.sigma.getBBox();
  const tlVp = state.sigma.graphToViewport({ x: minX, y: maxY });
  const brVp = state.sigma.graphToViewport({ x: maxX, y: minY });
  const graphVpW = Math.abs(brVp.x - tlVp.x);
  const graphVpH = Math.abs(brVp.y - tlVp.y);

  // Reserve ~90px at bottom for timeline; add 10% horizontal padding.
  const TIMELINE_H = 90;
  const PADDING_X = 1.1;
  const PADDING_Y = 1.3; // extra vertical padding clears timeline
  const xFit = camState.ratio * (graphVpW * PADDING_X / width);
  const yFit = camState.ratio * (graphVpH * PADDING_Y / (height - TIMELINE_H));
  const newRatio = Math.max(xFit, yFit, 0.3);

  cam.setState({ x: newCx, y: newCy, ratio: newRatio, angle: 0 });
}

async function boot() {
  let data = window.__GRAPH_DATA__;
  if (!data) {
    const response = await fetch("./data/graph-data.json");
    data = await response.json();
  }

  state.rawData = data;
  state.selectedYear = data.timelineYears[data.timelineYears.length - 1];
  buildAdjacency();
  buildLayout();
  renderLegend();
  renderTimeline();
  setButtonGroup(state.viewMode, controls.view, "view");
  updateClustersVisibility();
  initRenderer();
  bindInteractions();
  updateVisibility();
}

boot().catch((error) => {
  detail.summary.textContent = "Failed to load graph preview data.";
  detail.panel.classList.add("is-active");
  console.error(error);
});
