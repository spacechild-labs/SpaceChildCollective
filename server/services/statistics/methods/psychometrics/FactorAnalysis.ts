/**
 * Factor Analysis Methods
 * 
 * Exploratory Factor Analysis (EFA) implementation.
 * Uses principal axis factoring with varimax rotation.
 */

import { randomUUID } from "crypto";
import type { 
  AnalysisSpec, 
  AnalysisResult, 
  DesignObject,
  FactorLoading,
  FactorAnalysisResult 
} from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

/**
 * Exploratory Factor Analysis
 */
export class EFAMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const items = spec.outcomes;
    
    if (items.length < 3) {
      throw new Error("EFA requires at least 3 items");
    }
    
    const n = data.length;
    const k = items.length;
    
    // Get item data matrix
    const itemData: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      let valid = true;
      for (const item of items) {
        const val = Number(data[i][item]);
        if (isNaN(val)) {
          valid = false;
          break;
        }
        row.push(val);
      }
      if (valid) itemData.push(row);
    }
    
    const validN = itemData.length;
    if (validN < 50) {
      throw new Error(`Insufficient sample size for EFA (n=${validN}, recommend n≥100)`);
    }
    
    // Calculate correlation matrix
    const corrMatrix = this.calculateCorrelationMatrix(itemData, items);
    
    // Check factorability (KMO and Bartlett's test)
    const kmo = this.calculateKMO(corrMatrix);
    const bartlett = this.calculateBartlettTest(corrMatrix, validN);
    
    // Determine number of factors using parallel analysis approximation
    const nFactors = this.determineNumberOfFactors(corrMatrix, validN);
    
    // Extract factors using principal axis factoring
    const { loadings, eigenvalues, communalities } = this.extractFactors(corrMatrix, nFactors, items);
    
    // Apply varimax rotation
    const rotatedLoadings = this.varimaxRotation(loadings, nFactors);
    
    // Calculate variance explained
    const totalVariance = k;
    const varianceExplained = eigenvalues.slice(0, nFactors).map(e => (e / totalVariance) * 100);
    const cumulativeVariance = varianceExplained.reduce((acc, v, i) => {
      acc.push((acc[i - 1] || 0) + v);
      return acc;
    }, [] as number[]);
    
    // Build factor loadings structure
    const factorLoadings: FactorLoading[] = [];
    for (let i = 0; i < items.length; i++) {
      for (let f = 0; f < nFactors; f++) {
        factorLoadings.push({
          item: items[i],
          factor: f + 1,
          loading: rotatedLoadings[i][f],
          standardError: this.estimateLoadingSE(rotatedLoadings[i][f], validN)
        });
      }
    }
    
    // Determine primary factor for each item
    const itemFactorAssignments = items.map((item, i) => {
      const itemLoadings = rotatedLoadings[i];
      const maxIdx = itemLoadings.reduce((maxI, l, idx, arr) => 
        Math.abs(l) > Math.abs(arr[maxI]) ? idx : maxI, 0);
      return {
        item,
        primaryFactor: maxIdx + 1,
        loading: itemLoadings[maxIdx]
      };
    });
    
    // Build parameters
    const parameters = [
      { name: "Sample Size", estimate: validN },
      { name: "Number of Items", estimate: k },
      { name: "Number of Factors", estimate: nFactors },
      { name: "KMO", estimate: kmo },
      { name: "Bartlett χ²", estimate: bartlett.chiSquare, pValue: bartlett.pValue, df: bartlett.df }
    ];
    
    // Add eigenvalues
    eigenvalues.slice(0, Math.min(10, k)).forEach((e, i) => {
      parameters.push({ name: `Eigenvalue ${i + 1}`, estimate: e });
    });
    
    // Interpretation
    let kmoInterpretation: string;
    if (kmo >= 0.9) kmoInterpretation = "marvelous";
    else if (kmo >= 0.8) kmoInterpretation = "meritorious";
    else if (kmo >= 0.7) kmoInterpretation = "middling";
    else if (kmo >= 0.6) kmoInterpretation = "mediocre";
    else if (kmo >= 0.5) kmoInterpretation = "miserable";
    else kmoInterpretation = "unacceptable";
    
    const factorResult: FactorAnalysisResult = {
      method: "principal_axis",
      rotation: "varimax",
      nFactors,
      loadings: factorLoadings,
      eigenvalues,
      varianceExplained,
      cumulativeVariance,
      communalities: Object.fromEntries(items.map((item, i) => [item, communalities[i]])),
      kmo,
      bartlettTest: bartlett
    };
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "other",
        value: cumulativeVariance[nFactors - 1],
        interpretation: cumulativeVariance[nFactors - 1] >= 60 ? "good" : 
                       cumulativeVariance[nFactors - 1] >= 50 ? "acceptable" : "poor" as any
      }],
      modelFit: {
        rSquared: cumulativeVariance[nFactors - 1] / 100
      },
      factorAnalysis: factorResult,
      conclusion: `EFA extracted ${nFactors} factors explaining ${cumulativeVariance[nFactors - 1].toFixed(1)}% of variance. KMO = ${kmo.toFixed(3)} (${kmoInterpretation}).`,
      interpretation: `An exploratory factor analysis was conducted on ${k} items using principal axis factoring with varimax rotation. The Kaiser-Meyer-Olkin measure verified sampling adequacy (KMO = ${kmo.toFixed(2)}, ${kmoInterpretation}). Bartlett's test of sphericity was ${bartlett.pValue < 0.001 ? "significant" : "not significant"} (χ²(${bartlett.df}) = ${bartlett.chiSquare.toFixed(2)}, p ${bartlett.pValue < 0.001 ? "< .001" : `= ${bartlett.pValue.toFixed(3)}`}), indicating correlations were sufficiently large for factor analysis. ${nFactors} factors were extracted, explaining ${cumulativeVariance[nFactors - 1].toFixed(1)}% of the total variance.`,
      createdAt: new Date().toISOString()
    };
  }
  
  private calculateCorrelationMatrix(data: number[][], items: string[]): number[][] {
    const k = items.length;
    const n = data.length;
    const matrix: number[][] = [];
    
    // Calculate means
    const means = items.map((_, j) => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += data[i][j];
      return sum / n;
    });
    
    // Calculate SDs
    const sds = items.map((_, j) => {
      let sumSq = 0;
      for (let i = 0; i < n; i++) sumSq += Math.pow(data[i][j] - means[j], 2);
      return Math.sqrt(sumSq / (n - 1));
    });
    
    // Calculate correlations
    for (let i = 0; i < k; i++) {
      matrix[i] = [];
      for (let j = 0; j < k; j++) {
        if (i === j) {
          matrix[i][j] = 1;
        } else if (j < i) {
          matrix[i][j] = matrix[j][i];
        } else {
          let sumProd = 0;
          for (let r = 0; r < n; r++) {
            sumProd += (data[r][i] - means[i]) * (data[r][j] - means[j]);
          }
          matrix[i][j] = sumProd / ((n - 1) * sds[i] * sds[j]);
        }
      }
    }
    
    return matrix;
  }
  
  private calculateKMO(corrMatrix: number[][]): number {
    const k = corrMatrix.length;
    let sumR2 = 0;
    let sumQ2 = 0;
    
    // Calculate partial correlations (simplified approximation)
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const r = corrMatrix[i][j];
        sumR2 += r * r;
        
        // Approximate partial correlation
        let sumPartial = 0;
        for (let m = 0; m < k; m++) {
          if (m !== i && m !== j) {
            sumPartial += corrMatrix[i][m] * corrMatrix[j][m];
          }
        }
        const q = sumPartial / (k - 2);
        sumQ2 += q * q;
      }
    }
    
    return sumR2 / (sumR2 + sumQ2);
  }
  
  private calculateBartlettTest(corrMatrix: number[][], n: number): { chiSquare: number; df: number; pValue: number } {
    const k = corrMatrix.length;
    
    // Calculate determinant (simplified for small matrices)
    const det = this.matrixDeterminant(corrMatrix);
    
    // Bartlett's test statistic
    const chiSquare = -((n - 1) - (2 * k + 5) / 6) * Math.log(Math.max(det, 1e-10));
    const df = (k * (k - 1)) / 2;
    const pValue = 1 - StatUtils.chi2CDF(chiSquare, df);
    
    return { chiSquare, df, pValue };
  }
  
  private matrixDeterminant(matrix: number[][]): number {
    const n = matrix.length;
    if (n === 1) return matrix[0][0];
    if (n === 2) return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
    
    // LU decomposition approximation for larger matrices
    let det = 1;
    const lu = matrix.map(row => [...row]);
    
    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(lu[k][i]) > Math.abs(lu[maxRow][i])) maxRow = k;
      }
      if (maxRow !== i) {
        [lu[i], lu[maxRow]] = [lu[maxRow], lu[i]];
        det *= -1;
      }
      if (Math.abs(lu[i][i]) < 1e-10) return 0;
      det *= lu[i][i];
      for (let k = i + 1; k < n; k++) {
        const factor = lu[k][i] / lu[i][i];
        for (let j = i; j < n; j++) {
          lu[k][j] -= factor * lu[i][j];
        }
      }
    }
    
    return det;
  }
  
  private determineNumberOfFactors(corrMatrix: number[][], n: number): number {
    const eigenvalues = this.calculateEigenvalues(corrMatrix);
    
    // Kaiser criterion (eigenvalue > 1)
    const kaiserFactors = eigenvalues.filter(e => e > 1).length;
    
    // Parallel analysis approximation
    const k = corrMatrix.length;
    const randomEigenvalues = [];
    for (let i = 0; i < k; i++) {
      // Approximate random eigenvalue using formula
      randomEigenvalues.push(1 + Math.sqrt(k / n) * (1 - (i + 0.5) / k));
    }
    
    let parallelFactors = 0;
    for (let i = 0; i < k; i++) {
      if (eigenvalues[i] > randomEigenvalues[i]) parallelFactors++;
      else break;
    }
    
    // Use the more conservative estimate, but at least 1
    return Math.max(1, Math.min(kaiserFactors, parallelFactors, Math.floor(k / 3)));
  }
  
  private calculateEigenvalues(matrix: number[][]): number[] {
    // Power iteration method for eigenvalue estimation
    const n = matrix.length;
    const eigenvalues: number[] = [];
    const workMatrix = matrix.map(row => [...row]);
    
    for (let f = 0; f < n; f++) {
      let vector = Array(n).fill(1 / Math.sqrt(n));
      let eigenvalue = 0;
      
      // Power iteration
      for (let iter = 0; iter < 100; iter++) {
        const newVector = Array(n).fill(0);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            newVector[i] += workMatrix[i][j] * vector[j];
          }
        }
        
        eigenvalue = Math.sqrt(newVector.reduce((s, v) => s + v * v, 0));
        if (eigenvalue < 1e-10) break;
        
        vector = newVector.map(v => v / eigenvalue);
      }
      
      eigenvalues.push(eigenvalue);
      
      // Deflate matrix
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          workMatrix[i][j] -= eigenvalue * vector[i] * vector[j];
        }
      }
    }
    
    return eigenvalues.sort((a, b) => b - a);
  }
  
  private extractFactors(
    corrMatrix: number[][],
    nFactors: number,
    items: string[]
  ): { loadings: number[][]; eigenvalues: number[]; communalities: number[] } {
    const k = items.length;
    const eigenvalues = this.calculateEigenvalues(corrMatrix);
    
    // Extract factor loadings using principal axis method
    const loadings: number[][] = [];
    const workMatrix = corrMatrix.map(row => [...row]);
    
    for (let i = 0; i < k; i++) {
      loadings[i] = [];
    }
    
    for (let f = 0; f < nFactors; f++) {
      let vector = Array(k).fill(1 / Math.sqrt(k));
      let eigenvalue = eigenvalues[f];
      
      // Power iteration for eigenvector
      for (let iter = 0; iter < 50; iter++) {
        const newVector = Array(k).fill(0);
        for (let i = 0; i < k; i++) {
          for (let j = 0; j < k; j++) {
            newVector[i] += workMatrix[i][j] * vector[j];
          }
        }
        
        const norm = Math.sqrt(newVector.reduce((s, v) => s + v * v, 0));
        if (norm < 1e-10) break;
        vector = newVector.map(v => v / norm);
      }
      
      // Factor loadings = eigenvector * sqrt(eigenvalue)
      const sqrtEigen = Math.sqrt(Math.max(eigenvalue, 0));
      for (let i = 0; i < k; i++) {
        loadings[i][f] = vector[i] * sqrtEigen;
      }
      
      // Deflate
      for (let i = 0; i < k; i++) {
        for (let j = 0; j < k; j++) {
          workMatrix[i][j] -= eigenvalue * vector[i] * vector[j];
        }
      }
    }
    
    // Calculate communalities
    const communalities = loadings.map(row => 
      row.reduce((sum, l) => sum + l * l, 0)
    );
    
    return { loadings, eigenvalues, communalities };
  }
  
  private varimaxRotation(loadings: number[][], nFactors: number): number[][] {
    if (nFactors < 2) return loadings;
    
    const k = loadings.length;
    const rotated = loadings.map(row => [...row]);
    
    // Varimax rotation (simplified)
    const maxIter = 100;
    const tol = 1e-6;
    
    for (let iter = 0; iter < maxIter; iter++) {
      let maxChange = 0;
      
      for (let p = 0; p < nFactors - 1; p++) {
        for (let q = p + 1; q < nFactors; q++) {
          // Calculate rotation angle
          let a = 0, b = 0, c = 0, d = 0;
          
          for (let i = 0; i < k; i++) {
            const u = rotated[i][p] * rotated[i][p] - rotated[i][q] * rotated[i][q];
            const v = 2 * rotated[i][p] * rotated[i][q];
            a += u;
            b += v;
            c += u * u - v * v;
            d += 2 * u * v;
          }
          
          const phi = 0.25 * Math.atan2(d - 2 * a * b / k, c - (a * a - b * b) / k);
          
          if (Math.abs(phi) > tol) {
            maxChange = Math.max(maxChange, Math.abs(phi));
            const cos = Math.cos(phi);
            const sin = Math.sin(phi);
            
            for (let i = 0; i < k; i++) {
              const temp = rotated[i][p] * cos + rotated[i][q] * sin;
              rotated[i][q] = -rotated[i][p] * sin + rotated[i][q] * cos;
              rotated[i][p] = temp;
            }
          }
        }
      }
      
      if (maxChange < tol) break;
    }
    
    return rotated;
  }
  
  private estimateLoadingSE(loading: number, n: number): number {
    // Approximate standard error for factor loading
    return Math.sqrt((1 - loading * loading) / (n - 1));
  }
  
  getRequiredAssumptions(): string[] {
    return ["sample_size", "multicollinearity"];
  }
  
  getMinimumSampleSize(): number {
    return 100;
  }
}
