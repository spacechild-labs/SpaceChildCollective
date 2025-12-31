/**
 * Network Psychometrics
 * 
 * Network analysis of psychological constructs using partial correlation networks.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

interface NetworkEdge {
  from: string;
  to: string;
  weight: number;
  significant: boolean;
}

interface NetworkNode {
  name: string;
  strength: number;
  closeness: number;
  betweenness: number;
  expectedInfluence: number;
}

/**
 * Gaussian Graphical Model (GGM)
 * 
 * Estimates partial correlation network from multivariate data.
 * Edges represent conditional dependencies between variables.
 */
export class NetworkAnalysisMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const variables = spec.outcomes;
    
    if (variables.length < 4) {
      throw new Error("Network analysis requires at least 4 variables");
    }
    
    const k = variables.length;
    
    // Get valid data
    const validData: number[][] = [];
    for (const row of data) {
      const values = variables.map(v => Number(row[v]));
      if (values.every(v => !isNaN(v))) {
        validData.push(values);
      }
    }
    
    const n = validData.length;
    if (n < 50) {
      throw new Error(`Insufficient sample size for network analysis (n=${n}, need at least 50)`);
    }
    
    // Calculate correlation matrix
    const means = variables.map((_, j) => 
      validData.reduce((sum, row) => sum + row[j], 0) / n
    );
    
    const sds = variables.map((_, j) => {
      const m = means[j];
      return Math.sqrt(validData.reduce((sum, row) => sum + Math.pow(row[j] - m, 2), 0) / (n - 1));
    });
    
    // Standardize
    const zData = validData.map(row => 
      row.map((val, j) => (val - means[j]) / (sds[j] || 1))
    );
    
    // Correlation matrix
    const R: number[][] = [];
    for (let i = 0; i < k; i++) {
      R[i] = [];
      for (let j = 0; j < k; j++) {
        if (i === j) {
          R[i][j] = 1;
        } else {
          let sum = 0;
          for (let p = 0; p < n; p++) {
            sum += zData[p][i] * zData[p][j];
          }
          R[i][j] = sum / (n - 1);
        }
      }
    }
    
    // Compute partial correlation matrix (precision matrix approach)
    // P = R^(-1), then partial_r_ij = -P_ij / sqrt(P_ii * P_jj)
    
    // Matrix inversion using Gauss-Jordan elimination
    const augmented: number[][] = R.map((row, i) => 
      [...row, ...Array(k).fill(0).map((_, j) => i === j ? 1 : 0)]
    );
    
    // Forward elimination
    for (let col = 0; col < k; col++) {
      // Find pivot
      let maxRow = col;
      for (let row = col + 1; row < k; row++) {
        if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxRow][col])) {
          maxRow = row;
        }
      }
      [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]];
      
      const pivot = augmented[col][col];
      if (Math.abs(pivot) < 1e-10) {
        // Matrix is singular, use regularization
        augmented[col][col] = 0.01;
      }
      
      // Scale pivot row
      for (let j = 0; j < 2 * k; j++) {
        augmented[col][j] /= pivot || 0.01;
      }
      
      // Eliminate column
      for (let row = 0; row < k; row++) {
        if (row !== col) {
          const factor = augmented[row][col];
          for (let j = 0; j < 2 * k; j++) {
            augmented[row][j] -= factor * augmented[col][j];
          }
        }
      }
    }
    
    // Extract inverse (precision matrix)
    const P: number[][] = augmented.map(row => row.slice(k));
    
    // Calculate partial correlations
    const partialR: number[][] = [];
    for (let i = 0; i < k; i++) {
      partialR[i] = [];
      for (let j = 0; j < k; j++) {
        if (i === j) {
          partialR[i][j] = 0;
        } else {
          const denom = Math.sqrt(Math.abs(P[i][i] * P[j][j]));
          partialR[i][j] = denom > 0 ? -P[i][j] / denom : 0;
          // Constrain to [-1, 1]
          partialR[i][j] = Math.max(-1, Math.min(1, partialR[i][j]));
        }
      }
    }
    
    // Apply threshold (simplified LASSO-like sparsification)
    // Use significance threshold based on Fisher's z transformation
    const threshold = 1.96 / Math.sqrt(n - k - 2);
    
    // Build edge list
    const edges: NetworkEdge[] = [];
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const weight = partialR[i][j];
        const significant = Math.abs(weight) > threshold;
        edges.push({
          from: variables[i],
          to: variables[j],
          weight,
          significant
        });
      }
    }
    
    // Calculate centrality measures
    const nodes: NetworkNode[] = variables.map((name, i) => {
      // Strength: sum of absolute edge weights
      let strength = 0;
      for (let j = 0; j < k; j++) {
        if (i !== j) {
          strength += Math.abs(partialR[i][j]);
        }
      }
      
      // Expected Influence: sum of edge weights (signed)
      let expectedInfluence = 0;
      for (let j = 0; j < k; j++) {
        if (i !== j) {
          expectedInfluence += partialR[i][j];
        }
      }
      
      // Closeness: inverse of average shortest path (using |1/r| as distance)
      // Simplified: use inverse of average distance
      let totalDist = 0;
      for (let j = 0; j < k; j++) {
        if (i !== j) {
          const r = Math.abs(partialR[i][j]);
          totalDist += r > 0.01 ? 1 / r : 100;
        }
      }
      const closeness = (k - 1) / totalDist;
      
      // Betweenness: simplified approximation
      // Count how often node i is on shortest paths between other pairs
      let betweenness = 0;
      for (let s = 0; s < k; s++) {
        for (let t = s + 1; t < k; t++) {
          if (s !== i && t !== i) {
            const directDist = Math.abs(partialR[s][t]) > 0.01 ? 1 / Math.abs(partialR[s][t]) : 100;
            const viaDist = (Math.abs(partialR[s][i]) > 0.01 ? 1 / Math.abs(partialR[s][i]) : 100) +
                           (Math.abs(partialR[i][t]) > 0.01 ? 1 / Math.abs(partialR[i][t]) : 100);
            if (viaDist < directDist) {
              betweenness += 1;
            }
          }
        }
      }
      // Normalize
      betweenness = betweenness / ((k - 1) * (k - 2) / 2);
      
      return { name, strength, closeness, betweenness, expectedInfluence };
    });
    
    // Network-level statistics
    const significantEdges = edges.filter(e => e.significant);
    const density = significantEdges.length / (k * (k - 1) / 2);
    const avgWeight = edges.reduce((s, e) => s + Math.abs(e.weight), 0) / edges.length;
    const avgStrength = nodes.reduce((s, n) => s + n.strength, 0) / k;
    
    // Small-worldness approximation
    // Compare clustering and path length to random network
    let clustering = 0;
    for (let i = 0; i < k; i++) {
      const neighbors = [];
      for (let j = 0; j < k; j++) {
        if (i !== j && Math.abs(partialR[i][j]) > threshold) {
          neighbors.push(j);
        }
      }
      if (neighbors.length >= 2) {
        let triangles = 0;
        let possibleTriangles = neighbors.length * (neighbors.length - 1) / 2;
        for (let a = 0; a < neighbors.length; a++) {
          for (let b = a + 1; b < neighbors.length; b++) {
            if (Math.abs(partialR[neighbors[a]][neighbors[b]]) > threshold) {
              triangles++;
            }
          }
        }
        clustering += possibleTriangles > 0 ? triangles / possibleTriangles : 0;
      }
    }
    clustering /= k;
    
    // Build parameters
    const parameters = [
      { name: "Number of Nodes", estimate: k },
      { name: "Sample Size", estimate: n },
      { name: "Number of Edges (significant)", estimate: significantEdges.length },
      { name: "Network Density", estimate: density },
      { name: "Average Edge Weight", estimate: avgWeight },
      { name: "Average Node Strength", estimate: avgStrength },
      { name: "Global Clustering Coefficient", estimate: clustering }
    ];
    
    // Add centrality for each node
    const sortedByStrength = [...nodes].sort((a, b) => b.strength - a.strength);
    sortedByStrength.forEach((node, rank) => {
      parameters.push({
        name: `Strength (${node.name})`,
        estimate: node.strength
      });
    });
    
    // Identify bridge nodes (high betweenness)
    const bridgeNodes = nodes.filter(n => n.betweenness > 0.1).map(n => n.name);
    
    // Identify central nodes (high strength)
    const centralNodes = sortedByStrength.slice(0, 3).map(n => n.name);
    
    // Strongest edges
    const strongestEdges = [...edges]
      .filter(e => e.significant)
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
      .slice(0, 5);
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "other",
        value: density,
        interpretation: density > 0.5 ? "dense" : density > 0.2 ? "moderate" : "sparse" as any
      }],
      modelFit: {
        rSquared: avgStrength / k
      },
      conclusion: `Network: ${k} nodes, ${significantEdges.length} edges, density = ${density.toFixed(3)}, avg strength = ${avgStrength.toFixed(3)}`,
      interpretation: `A Gaussian Graphical Model (partial correlation network) was estimated from ${k} variables with ${n} observations. The network contained ${significantEdges.length} significant edges (density = ${(density * 100).toFixed(1)}%). ${centralNodes.length > 0 ? `The most central nodes (by strength) were: ${centralNodes.join(", ")}.` : ""} ${bridgeNodes.length > 0 ? `Potential bridge nodes (high betweenness): ${bridgeNodes.join(", ")}.` : ""} ${strongestEdges.length > 0 ? `The strongest connections were: ${strongestEdges.map(e => `${e.from}–${e.to} (r = ${e.weight.toFixed(2)})`).join("; ")}.` : ""} Global clustering coefficient was ${clustering.toFixed(2)}, indicating ${clustering > 0.5 ? "high" : clustering > 0.2 ? "moderate" : "low"} local connectivity.`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["normality", "sample_size"];
  }
  
  getMinimumSampleSize(): number {
    return 100;
  }
}
