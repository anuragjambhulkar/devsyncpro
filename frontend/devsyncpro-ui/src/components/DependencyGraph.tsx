import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

type DependencyGraphProps = {
  graph: Record<string, string[]>;
  blastRadiusMap: Record<string, number>;
};

export const DependencyGraph: React.FC<DependencyGraphProps> = ({
  graph,
  blastRadiusMap,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!graph || !svgRef.current) return;

    // Transform graph to nodes/links array
    const nodes = Object.keys(graph).map((node) => ({ id: node }));
    const links = Object.entries(graph).flatMap(([src, targets]) =>
      targets.map((target) => ({ source: src, target }))
    );

    const width = 500;
    const height = 400;
    const minR = 20;
    const maxR = 40;
    const allBlasts = Object.values(blastRadiusMap);
    const maxBlast = allBlasts.length ? Math.max(...allBlasts, 1) : 1;

    // Remove previous tooltip
    d3.select(".graph-tooltip").remove();

    // Create tooltip (once per render)
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

    // Clear svg before new drawing
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

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
        const br = blastRadiusMap[d.id] ?? 1;
        return minR + (maxR - minR) * (br / maxBlast);
      })
      .attr("fill", (d: any) => {
        const br = blastRadiusMap[d.id] ?? 1;
        return d3.interpolateRdYlGn(1 - br / maxBlast);
      });

    node
      .on("mouseover", function (event: any, d: any) {
        tooltip
          .html(
            `<b>${d.id}</b><br/>Blast Radius: <b>${blastRadiusMap[d.id] ?? "-"}</b>`
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

    (node as any).call(drag(simulation));

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

    function drag(sim: any) {
      return d3
        .drag()
        .on("start", function (event: any, d: any) {
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", function (event: any, d: any) {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", function (event: any, d: any) {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        });
    }

    // Clean up tooltip on unmount
    return () => {
      tooltip.remove();
    };
  }, [graph, blastRadiusMap]);

  return (
    <svg
      ref={svgRef}
      style={{ background: "#222", borderRadius: "8px", marginBottom: "2rem" }}
    ></svg>
  );
};
