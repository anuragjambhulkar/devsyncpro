import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

interface DependencyGraphProps {
  graph: Record<string, string[]>;
  healthMap?: Record<string, "healthy" | "warning" | "critical">;
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
  ) as Record<string, number>;
}

// ---- Export PNG (robust for responsive SVGs) ----
const exportSVGAsPNG = (svgElement: SVGSVGElement | null, name = "graph.png") => {
  if (!svgElement) return;
  const bbox = svgElement.getBoundingClientRect();
  const width = Math.max(1, Math.round(bbox.width));
  const height = Math.max(1, Math.round(bbox.height));

  const clone = svgElement.cloneNode(true) as SVGSVGElement;

  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  const style = window.getComputedStyle(svgElement);
  const bg = style.getPropertyValue("background-color") || "#ffffff";

  const existingRect = clone.querySelector("rect#_export_bg");
  if (!existingRect) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("id", "_export_bg");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
    rect.setAttribute("fill", bg);
    clone.insertBefore(rect, clone.firstChild);
  }

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);
    const a = document.createElement("a");
    a.download = name;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };
  img.onerror = (e) => {
    console.error("Failed to load SVG image for export", e);
    URL.revokeObjectURL(url);
  };
  img.src = url;
};

// ---- Export SVG (robust for responsive SVGs) ----
const exportSVG = (svgElement: SVGSVGElement | null, name = "graph.svg") => {
  if (!svgElement) return;
  const bbox = svgElement.getBoundingClientRect();
  const width = Math.max(1, Math.round(bbox.width));
  const height = Math.max(1, Math.round(bbox.height));

  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  let svgString = new XMLSerializer().serializeToString(clone);
  if (!svgString.match(/^<svg[^>]+xmlns=/)) {
    svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = name;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
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
  healthMap = {},
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // compute transitive blast radii
  const actualBlastRadius = computeTransitiveBlastRadius(graph || {});
  const allBlasts = Object.values(actualBlastRadius);
  const maxBlast = allBlasts.length ? Math.max(...allBlasts, 1) : 1;

  useEffect(() => {
    if (!graph || !svgRef.current) return;

    // typed as any[] to avoid D3/TS generic mismatches
    const nodes: any[] = Object.keys(graph).map((node) => ({ id: node }));
    const links: any[] = Object.entries(graph).flatMap(([src, targets]) =>
      (targets || []).map((target) => ({ source: src, target }))
    );

    const width = 900;
    const height = 520;
    const minR = 14;
    const maxR = 36;

    d3.select(".graph-tooltip").remove();
    const tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "graph-tooltip")
      .style("position", "absolute")
      .style("z-index", "10")
      .style("background", "#222")
      .style("color", "#fff")
      .style("padding", "6px 10px")
      .style("border-radius", "6px")
      .style("pointer-events", "none")
      .style("font-size", "13px")
      .style("display", "none");

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", "100%").attr("height", String(height)).style("background", "#111");

    // container group for zoom/pan
    const container = svg.append("g").attr("class", "graph-container");

    // zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        container.attr("transform", event.transform as any);
      });
    svg.call(zoom as any);

    // simulation
    const simulation = d3
      .forceSimulation(nodes as any)
      .force("link", d3.forceLink(links as any).id((d: any) => d.id).distance(120).strength(1))
      .force("charge", d3.forceManyBody().strength(-420))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius((d: any) => {
        const br = actualBlastRadius[d.id] ?? 1;
        return minR + (maxR - minR) * (br / Math.max(1, maxBlast));
      }));

    // links
    const link = container
      .append("g")
      .attr("stroke", "#666")
      .attr("stroke-opacity", 0.9)
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke-width", 1.5);

    // node groups
    const node = container
      .append("g")
      .selectAll("g")
      .data(nodes)
      .enter()
      .append("g");

    // typed drag behavior for group elements with any datum
    const dragBehavior = d3.drag<SVGGElement, any>()
      .on("start", (event: any, d: any) => {
        if (!event.active) (simulation as any).alphaTarget(0.3).restart();
        (d as any).fx = (d as any).x;
        (d as any).fy = (d as any).y;
      })
      .on("drag", (event: any, d: any) => {
        (d as any).fx = event.x;
        (d as any).fy = event.y;
      })
      .on("end", (event: any, d: any) => {
        if (!event.active) (simulation as any).alphaTarget(0);
        (d as any).fx = null;
        (d as any).fy = null;
      });

    // apply drag to node groups (cast to any to satisfy call signature)
    (node as any).call(dragBehavior as any);

    // append circle + label
    const circles = node
      .append("circle")
      .attr("r", (d: any) => {
        const br = actualBlastRadius[d.id] ?? 1;
        return minR + (maxR - minR) * (br / Math.max(1, maxBlast));
      })
      .attr("fill", (d: any) => {
        const br = actualBlastRadius[d.id] ?? 1;
        return d3.interpolateRdYlGn(1 - (br / Math.max(1, maxBlast)));
      })
      .attr("stroke", (d: any) => {
        const status = healthMap[d.id] || "healthy";
        if (status === "critical") return "#ff3737";
        if (status === "warning") return "#ffa500";
        return "#222";
      })
      .attr("stroke-width", (d: any) => (healthMap[d.id] && healthMap[d.id] !== "healthy" ? 4 : 1.2))
      .on("mouseover", function (event: any, d: any) {
        const status = healthMap[d.id] || "healthy";
        tooltip
          .html(
            `<b>${d.id}</b><br/>
             Status: <b style="color:${status === 'critical' ? '#ff3737' : status === 'warning' ? '#ffa500' : '#5e5'}">${status.toUpperCase()}</b><br/>
             Transitive deps: <b>${actualBlastRadius[d.id] ?? 0}</b><br/>
             Direct: ${(graph[d.id] && graph[d.id].length) ? graph[d.id].join(", ") : "<i>none</i>"}`
          )
          .style("left", `${event.pageX + 12}px`)
          .style("top", `${event.pageY - 28}px`)
          .style("display", "block");
      })
      .on("mousemove", function (event: any) {
        tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY - 28}px`);
      })
      .on("mouseout", function () {
        tooltip.style("display", "none");
      });

    // Add pulsing effect for critical nodes
    node.each(function (d: any) {
      if (healthMap[d.id] === "critical") {
        const circle = d3.select(this).select("circle");
        (function repeat() {
          circle
            .transition()
            .duration(1000)
            .attr("stroke-width", 8)
            .attr("stroke-opacity", 0.5)
            .transition()
            .duration(1000)
            .attr("stroke-width", 4)
            .attr("stroke-opacity", 1)
            .on("end", repeat);
        })();
      }
    });

    node
      .append("text")
      .text((d: any) => d.id)
      .attr("text-anchor", "middle")
      .attr("dy", 4)
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("fill", "#fff");

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => (d.source as any).x)
        .attr("y1", (d: any) => (d.source as any).y)
        .attr("x2", (d: any) => (d.target as any).x)
        .attr("y2", (d: any) => (d.target as any).y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // cleanup on unmount
    return () => {
      tooltip.remove();
      (simulation as any).stop && (simulation as any).stop();
      svg.selectAll("*").remove();
    };
  }, [graph, svgRef, actualBlastRadius, maxBlast]);

  // Table rows
  const tableRows = Object.keys(graph || {}).map(id => {
    const val = actualBlastRadius[id] ?? 0;
    const color = d3.interpolateRdYlGn(1 - val / Math.max(1, maxBlast));
    const radius = Math.round(14 + (36 - 14) * (val / Math.max(1, maxBlast)));
    return (
      <tr key={id}>
        <td style={{ padding: "6px 10px", color: "#fff" }}>{id}</td>
        <td style={{ textAlign: "center", padding: "6px", color: "#fff" }}>{val}</td>
        <td style={{ textAlign: "center", padding: "6px" }}>
          <div style={{
            width: 22, height: 22,
            background: color,
            borderRadius: "50%",
            border: "1px solid #666",
            display: "inline-block"
          }} />
        </td>
        <td style={{ textAlign: "center", padding: "6px", color: "#fff" }}>{radius}</td>
      </tr>
    );
  });

  return (
    <div style={{ color: "#ddd", fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial" }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 6, color: "#ccc" }}>
          Node color: Green (low transitive deps) → Red (high)
        </div>
        <div style={{
          width: 320, height: 18, borderRadius: 8, background: "linear-gradient(90deg," +
            "rgba(38,166,91,1) 0%," +
            "rgba(253,231,37,1) 50%," +
            "rgba(220,53,69,1) 100%)",
          border: "1px solid #666"
        }} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <button onClick={() => exportSVGAsPNG(svgRef.current)} style={{ marginRight: 8 }}>Export as PNG</button>
        <button onClick={() => exportSVG(svgRef.current)} style={{ marginRight: 8 }}>Export as SVG</button>
        <button onClick={() => exportJSON(graph)}>Export as JSON</button>
      </div>

      <svg
        ref={svgRef}
        style={{ width: "100%", height: 520, borderRadius: 8, display: "block", background: "#111" }}
      ></svg>

      <h4 style={{ color: "#ccc", marginTop: 18 }}>Node Properties Table</h4>
      <table
        style={{
          color: "#fff",
          borderCollapse: "collapse",
          fontSize: "14px",
          marginTop: "12px",
          width: "100%",
          maxWidth: 720
        }}
      >
        <thead>
          <tr>
            <th style={{ borderBottom: "1px solid #444", textAlign: "left", padding: "6px" }}>Node</th>
            <th style={{ borderBottom: "1px solid #444", textAlign: "center", padding: "6px" }}>Transitive</th>
            <th style={{ borderBottom: "1px solid #444", textAlign: "center", padding: "6px" }}>Color</th>
            <th style={{ borderBottom: "1px solid #444", textAlign: "center", padding: "6px" }}>Radius(px)</th>
          </tr>
        </thead>
        <tbody>
          {tableRows}
        </tbody>
      </table>
    </div>
  );
};

export default DependencyGraph;
