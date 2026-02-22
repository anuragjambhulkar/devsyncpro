import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

interface DependencyGraphProps {
  graph: Record<string, string[]>;
  healthMap?: Record<string, "healthy" | "warning" | "critical">;
  onNodeSelect?: (nodeId: string) => void;
}

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

export const DependencyGraph: React.FC<DependencyGraphProps> = ({
  graph,
  healthMap = {},
  onNodeSelect,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const actualBlastRadius = computeTransitiveBlastRadius(graph || {});
  const allBlasts = Object.values(actualBlastRadius);
  const maxBlast = allBlasts.length ? Math.max(...allBlasts, 1) : 1;

  const simulationRef = useRef<any>(null);

  // Simulation Initialization (Only when graph structure changes)
  useEffect(() => {
    if (!graph || !svgRef.current) return;

    const nodes: any[] = Object.keys(graph).map((node) => ({ id: node }));
    const links: any[] = Object.entries(graph).flatMap(([src, targets]) =>
      (targets || []).map((target) => ({ source: src, target }))
    );

    const width = 1000;
    const height = 600;
    const minR = 16;
    const maxR = 40;

    d3.select(".graph-tooltip").remove();
    const tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "graph-tooltip")
      .style("position", "absolute")
      .style("z-index", "1000")
      .style("background", "rgba(15, 23, 42, 0.9)")
      .style("backdrop-filter", "blur(8px)")
      .style("color", "#fff")
      .style("padding", "12px 16px")
      .style("border", "1px solid rgba(255, 255, 255, 0.1)")
      .style("border-radius", "12px")
      .style("pointer-events", "none")
      .style("font-size", "13px")
      .style("box-shadow", "0 10px 25px rgba(0,0,0,0.4)")
      .style("display", "none");

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`)
      .style("background", "transparent");

    const container = svg.append("g").attr("class", "graph-container");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        container.attr("transform", event.transform as any);
      });
    svg.call(zoom as any);

    const simulation = d3
      .forceSimulation(nodes as any)
      .force("link", d3.forceLink(links as any).id((d: any) => d.id).distance(150).strength(1))
      .force("charge", d3.forceManyBody().strength(-600))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius((d: any) => {
        const br = actualBlastRadius[d.id] ?? 1;
        return (minR + (maxR - minR) * (br / Math.max(1, maxBlast))) + 10;
      }));

    simulationRef.current = simulation;

    // Glow Filter
    const defs = svg.append("defs");
    const filter = defs.append("filter")
      .attr("id", "glow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");
    filter.append("feGaussianBlur")
      .attr("stdDeviation", "4")
      .attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const link = container
      .append("g")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", "rgba(56, 189, 248, 0.2)")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5,5");

    const node = container
      .append("g")
      .selectAll("g")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node-group");

    const dragBehavior = d3.drag<SVGGElement, any>()
      .on("start", (event: any, d: any) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event: any, d: any) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event: any, d: any) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    (node as any).call(dragBehavior as any);

    node.append("circle")
      .attr("r", (d: any) => {
        const br = actualBlastRadius[d.id] ?? 1;
        return minR + (maxR - minR) * (br / Math.max(1, maxBlast));
      })
      .attr("class", "node-circle")
      .attr("filter", "url(#glow)")
      .style("cursor", "pointer")
      .on("mouseover", function (event: any, d: any) {
        d3.select(this).transition().duration(200).attr("r", (minR + (maxR - minR) * ((actualBlastRadius[d.id] ?? 1) / Math.max(1, maxBlast))) + 6);
        const status = healthMap[d.id] || "healthy";
        tooltip
          .html(
            `<b style="font-size:1.1rem; color:var(--primary)">${d.id}</b><br/>
             Status: <b style="color:${status === 'critical' ? 'var(--error)' : status === 'warning' ? 'var(--warning)' : 'var(--success)'}">${status.toUpperCase()}</b><br/>
             Transitive Blast: <b style="color:var(--accent)">${actualBlastRadius[d.id] ?? 0} services</b><br/>
             <div style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.1); padding-top:4px; font-size:0.75rem; color:var(--text-dim)">
               Direct: ${(graph[d.id] && graph[d.id].length) ? graph[d.id].join(", ") : "isolated"}
             </div>`
          )
          .style("left", `${event.pageX + 20}px`)
          .style("top", `${event.pageY - 40}px`)
          .style("display", "block");
      })
      .on("mousemove", (event: any) => {
        tooltip.style("left", `${event.pageX + 20}px`).style("top", `${event.pageY - 40}px`);
      })
      .on("mouseout", function (event: any, d: any) {
        d3.select(this).transition().duration(200).attr("r", minR + (maxR - minR) * ((actualBlastRadius[d.id] ?? 1) / Math.max(1, maxBlast)));
        tooltip.style("display", "none");
      })
      .on("click", (event: any, d: any) => {
        if (onNodeSelect) onNodeSelect(d.id);

        // Visual feedback for selection
        d3.selectAll(".node-circle").attr("stroke", "none").attr("stroke-width", 0);
        d3.select(event.currentTarget).attr("stroke", "var(--accent)").attr("stroke-width", 3);
      });

    node.append("text")
      .text((d: any) => d.id)
      .attr("text-anchor", "middle")
      .attr("dy", (d: any) => (minR + (maxR - minR) * ((actualBlastRadius[d.id] ?? 1) / Math.max(1, maxBlast))) + 16)
      .style("font-size", "12px")
      .style("font-weight", 600)
      .style("pointer-events", "none")
      .style("fill", "var(--text-main)")
      .style("text-transform", "uppercase");

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      tooltip.remove();
      simulation.stop();
    };
  }, [graph]); // Only structural changes reset everything

  // Health Color Update (Separate from simulation reset)
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current).selectAll(".node-circle")
      .transition().duration(500)
      .attr("fill", (d: any) => {
        const status = healthMap[d.id] || "healthy";
        if (status === "critical") return "var(--error)";
        if (status === "warning") return "var(--warning)";
        return "var(--primary)";
      });
  }, [healthMap]);

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        style={{ width: "100%", height: 600, display: "block" }}
      ></svg>
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        display: 'flex',
        gap: '20px',
        background: 'rgba(15, 23, 42, 0.4)',
        padding: '12px 20px',
        borderRadius: '12px',
        border: '1px solid var(--glass-border)',
        fontSize: '0.8rem',
        color: 'var(--text-dim)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 12, height: 12, background: 'var(--primary)', borderRadius: '50%', filter: 'blur(2px)' }}></div> Healthy
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 12, height: 12, background: 'var(--warning)', borderRadius: '50%', filter: 'blur(2px)' }}></div> Warning
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 12, height: 12, background: 'var(--error)', borderRadius: '50%', filter: 'blur(2px)' }}></div> Critical
        </div>
      </div>
    </div>
  );
};

export default DependencyGraph;
