import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

interface DependencyGraphProps {
  graph: Record<string, string[]>;
  blastRadiusMap?: Record<string, number>;
}

// ---- Transitive blast radius calculation ----
function computeTransitiveBlastRadius(graph: Record<string, string[]>) {
  function dfs(node: string, visited: Set<string>) {
    if (!graph[node]) return;
    for (const neighbor of graph[node]) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        dfs(neighbor, visited);
      }
    }
  }
  return Object.fromEntries(
    Object.keys(graph).map(node => {
      const visited = new Set<string>();
      dfs(node, visited);
      return [node, visited.size];
    })
  );
}

// ---- Export PNG ----
const exportSVGAsPNG = (svgElement: SVGSVGElement | null, name = "graph.png") => {
  if (!svgElement) return;
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgElement);
  const svg64 = btoa(unescape(encodeURIComponent(svgString)));
  const image64 = 'data:image/svg+xml;base64,' + svg64;
  const img = new window.Image();
  img.onload = function () {
    const canvas = document.createElement("canvas");
    canvas.width = svgElement.width.baseVal.value || 600;
    canvas.height = svgElement.height.baseVal.value || 400;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#181a20";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const link = document.createElement("a");
    link.download = name;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  img.src = image64;
};

// ---- Export SVG ----
const exportSVG = (svgElement: SVGSVGElement | null, name = "graph.svg") => {
  if (!svgElement) return;
  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(svgElement);
  // ensure xmlns for svg
  if (!svgString.match(/^<svg[^>]+xmlns=/)) {
    svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = name;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ---- Export data as JSON ----
const exportJSON = (graph: Record<string, string[]>, name = "graph.json") => {
  const blob = new Blob([JSON.stringify(graph, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = name;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const DependencyGraph: React.FC<DependencyGraphProps> = ({
  graph,
  blastRadiusMap, // will be ignored; always calculated internally
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Always compute actual transitive blast radius for both graph and table
  const actualBlastRadius = computeTransitiveBlastRadius(graph);
  const allBlasts = Object.values(actualBlastRadius);
  const maxBlast = allBlasts.length ? Math.max(...allBlasts, 1) : 1;

  useEffect(() => {
    if (!graph || !svgRef.current) return;
    const nodes = Object.keys(graph).map((node) => ({ id: node }));
    const links = Object.entries(graph).flatMap(([src, targets]) =>
      targets.map((target) => ({ source: src, target }))
    );
    const width = 540;
    const height = 420;
    const minR = 18;
    const maxR = 38;
    d3.select(".graph-tooltip").remove();

    // Tooltip
    const tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "graph-tooltip")
      .style("position", "absolute")
      .style("z-index", "10")
      .style("background", "#222")
      .style("color", "#fff")
      .style("padding", "5px 10px")
      .style("border-radius", "5px")
      .style("pointer-events", "none")
      .style("font-size", "13px")
      .style("display", "none");

    d3.select(svgRef.current).selectAll("*").remove();
    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    // Pan and zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 10])
      .on("zoom", (event) => {
        svg.selectAll("g").attr("transform", event.transform);
      });
    svg.call(zoom as any);

    // D3 network
    const simulation = d3
      .forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2));
    const link = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", "#aaa")
      .attr("stroke-width", 2);

    const node = svg
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("r", (d: any) => {
        const br = actualBlastRadius[d.id] ?? 1;
        return minR + (maxR - minR) * (br / maxBlast);
      })
      .attr("fill", (d: any) => {
        const br = actualBlastRadius[d.id] ?? 1;
        return d3.interpolateRdYlGn(1 - br / maxBlast);
      });

    node
      .on("mouseover", function (event: any, d: any) {
        tooltip
          .html(
            `<b>${d.id}</b><br/>Transitive dependencies: <b>${actualBlastRadius[d.id]}</b>` +
            `<br/>Direct: ${
              graph[d.id] && graph[d.id].length
                ? graph[d.id].map(dep => `<span style="color:#FFD700">${dep}</span>`).join(", ")
                : '<span style="color:#888">none</span>'
            }`
          )
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 28}px`)
          .style("display", "block");
      })
      .on("mousemove", function (event: any) {
        tooltip
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 28}px`);
      })
      .on("mouseout", function () {
        tooltip.style("display", "none");
      });

    (node as any).call(d3.drag()
      .on("start", function (event: any, d: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", function (event: any, d: any) {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", function (event: any, d: any) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      })
    );

    const label = svg
      .append("g")
      .selectAll("text")
      .data(nodes)
      .enter()
      .append("text")
      .text((d: any) => d.id)
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .style("font-size", "12px")
      .style("pointer-events", "none");

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
      node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);
      label.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y);
    });

    return () => {
      tooltip.remove();
    };
  }, [graph]);

  // -- Table view --
  const tableRows = Object.keys(graph).map(id => {
    const val = actualBlastRadius[id];
    const color = d3.interpolateRdYlGn(1 - val / maxBlast);
    const radius = Math.round(18 + (38 - 18) * (val / maxBlast));
    return (
      <tr key={id}>
        <td style={{ padding: "3px 8px" }}>{id}</td>
        <td style={{ textAlign: "center", padding: "3px" }}>{val}</td>
        <td style={{ textAlign: "center" }}>
          <div style={{
            width: 26, height: 26,
            background: color,
            borderRadius: "50%",
            display: "inline-block",
            border: "1px solid #666"
          }} />
        </td>
        <td style={{ textAlign: "center" }}>{radius}</td>
      </tr>
    );
  });

  return (
    <div>
      <div style={{ margin: "18px 0 10px 0" }}>
        <div style={{ marginBottom: 4, color: "#ccc" }}>
          Node color: Green (low transitive dependencies) → Red (high)
        </div>
        <div style={{
          width: 240, height: 18, borderRadius: 8, background: "linear-gradient(90deg," +
            "rgba(38,166,91,1) 0%," +
            "rgba(253,231,37,1) 50%," +
            "rgba(220,53,69,1) 100%)",
          border: "1px solid #666"
        }} />
        <div style={{
          fontSize: "10px", letterSpacing: 1, color: "#aaa",
          display: "flex", justifyContent: "space-between", width: 240
        }}>
          <span>Low</span>
          <span>High</span>
        </div>
      </div>
      <div style={{margin:"1em 0"}}>
        <button onClick={() => exportSVGAsPNG(svgRef.current)}>Export as PNG</button>
        <button onClick={() => exportSVG(svgRef.current)}>Export as SVG</button>
        <button onClick={() => exportJSON(graph)}>Export as JSON</button>
      </div>
      <svg
        ref={svgRef}
        style={{ background: "#222", borderRadius: "8px", marginBottom: "2rem" }}
      ></svg>
      <h4 style={{ color: "#ccc" }}>Node Properties Table</h4>
      <table
        style={{
          color: "#fff",
          borderCollapse: "collapse",
          fontSize: "15px",
          marginTop: "12px",
          width: "320px"
        }}
      >
        <thead>
          <tr>
            <th style={{ borderBottom: "1px solid #888", textAlign: "left", padding: "3px" }}>Node</th>
            <th style={{ borderBottom: "1px solid #888", textAlign: "center", padding: "3px" }}>Transitive Dependencies</th>
            <th style={{ borderBottom: "1px solid #888", textAlign: "center", padding: "3px" }}>Color</th>
            <th style={{ borderBottom: "1px solid #888", textAlign: "center", padding: "3px" }}>Radius(px)</th>
          </tr>
        </thead>
        <tbody>
          {tableRows}
        </tbody>
      </table>
    </div>
  );
};
