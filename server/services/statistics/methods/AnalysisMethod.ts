/**
 * Analysis Method Interface
 * 
 * Base interface and utilities for all statistical analysis methods.
 */

import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";

export interface AnalysisMethod {
  execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult>;
  
  getRequiredAssumptions(): string[];
  getMinimumSampleSize(): number;
}

/**
 * Statistical utility functions shared across methods
 */
export class StatUtils {
  static mean(arr: number[]): number {
    if (arr.length === 0) return NaN;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  
  static variance(arr: number[], ddof: number = 1): number {
    if (arr.length <= ddof) return NaN;
    const m = this.mean(arr);
    return arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / (arr.length - ddof);
  }
  
  static sd(arr: number[], ddof: number = 1): number {
    return Math.sqrt(this.variance(arr, ddof));
  }
  
  static sum(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0);
  }
  
  static median(arr: number[]): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  
  static percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
  }
  
  static skewness(arr: number[]): number {
    const n = arr.length;
    const m = this.mean(arr);
    const s = this.sd(arr);
    const m3 = arr.reduce((sum, x) => sum + Math.pow((x - m) / s, 3), 0) / n;
    return m3 * Math.sqrt(n * (n - 1)) / (n - 2);
  }
  
  static kurtosis(arr: number[]): number {
    const n = arr.length;
    const m = this.mean(arr);
    const s = this.sd(arr);
    const m4 = arr.reduce((sum, x) => sum + Math.pow((x - m) / s, 4), 0) / n;
    return ((n + 1) * n * m4 - 3 * (n - 1) * (n - 1) * (n - 1)) / ((n - 1) * (n - 2) * (n - 3));
  }
  
  static covariance(x: number[], y: number[]): number {
    if (x.length !== y.length) throw new Error("Arrays must have same length");
    const n = x.length;
    const mx = this.mean(x);
    const my = this.mean(y);
    return x.reduce((sum, xi, i) => sum + (xi - mx) * (y[i] - my), 0) / (n - 1);
  }
  
  static correlation(x: number[], y: number[]): number {
    return this.covariance(x, y) / (this.sd(x) * this.sd(y));
  }
  
  /**
   * Normal CDF approximation
   */
  static normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    
    return 0.5 * (1.0 + sign * y);
  }
  
  /**
   * Inverse normal CDF (quantile function)
   */
  static normalQuantile(p: number): number {
    if (p <= 0 || p >= 1) throw new Error("p must be between 0 and 1");
    
    // Rational approximation
    const a = [
      -3.969683028665376e+01, 2.209460984245205e+02,
      -2.759285104469687e+02, 1.383577518672690e+02,
      -3.066479806614716e+01, 2.506628277459239e+00
    ];
    const b = [
      -5.447609879822406e+01, 1.615858368580409e+02,
      -1.556989798598866e+02, 6.680131188771972e+01,
      -1.328068155288572e+01
    ];
    const c = [
      -7.784894002430293e-03, -3.223964580411365e-01,
      -2.400758277161838e+00, -2.549732539343734e+00,
      4.374664141464968e+00, 2.938163982698783e+00
    ];
    const d = [
      7.784695709041462e-03, 3.224671290700398e-01,
      2.445134137142996e+00, 3.754408661907416e+00
    ];
    
    const pLow = 0.02425;
    const pHigh = 1 - pLow;
    let q: number, r: number;
    
    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    } else if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
             (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
              ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
  }
  
  /**
   * Log gamma function
   */
  static logGamma(x: number): number {
    const c = [
      76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5
    ];
    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  
  /**
   * Beta function
   */
  static beta(a: number, b: number): number {
    return Math.exp(this.logGamma(a) + this.logGamma(b) - this.logGamma(a + b));
  }
  
  /**
   * Incomplete beta function (regularized)
   */
  static incompleteBeta(a: number, b: number, x: number): number {
    if (x === 0) return 0;
    if (x === 1) return 1;
    
    const bt = Math.exp(
      this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) +
      a * Math.log(x) + b * Math.log(1 - x)
    );
    
    if (x < (a + 1) / (a + b + 2)) {
      return bt * this.betaCF(a, b, x) / a;
    }
    return 1 - bt * this.betaCF(b, a, 1 - x) / b;
  }
  
  private static betaCF(a: number, b: number, x: number): number {
    const maxIter = 100;
    const eps = 1e-10;
    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;
    let c = 1;
    let d = 1 - qab * x / qap;
    if (Math.abs(d) < eps) d = eps;
    d = 1 / d;
    let h = d;
    
    for (let m = 1; m <= maxIter; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < eps) d = eps;
      c = 1 + aa / c;
      if (Math.abs(c) < eps) c = eps;
      d = 1 / d;
      h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < eps) d = eps;
      c = 1 + aa / c;
      if (Math.abs(c) < eps) c = eps;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < eps) break;
    }
    return h;
  }
  
  /**
   * T-distribution CDF
   */
  static tCDF(t: number, df: number): number {
    const x = df / (df + t * t);
    return 1 - 0.5 * this.incompleteBeta(df / 2, 0.5, x);
  }
  
  /**
   * T-distribution p-value (two-tailed)
   */
  static tPValue(t: number, df: number): number {
    return 2 * (1 - this.tCDF(Math.abs(t), df));
  }

  /**
   * Two-tailed t critical value: the t such that P(-t <= T <= t) = 1 - alpha.
   * Found by bisection on the t CDF (converges to ~1.96 as df -> infinity).
   */
  static tCritical(df: number, alpha: number = 0.05): number {
    const target = 1 - alpha / 2;
    let lo = 0;
    let hi = 1000;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (this.tCDF(mid, df) < target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  
  /**
   * F-distribution CDF
   */
  static fCDF(f: number, d1: number, d2: number): number {
    const x = d1 * f / (d1 * f + d2);
    return this.incompleteBeta(d1 / 2, d2 / 2, x);
  }
  
  /**
   * Chi-square CDF
   */
  static chi2CDF(x: number, df: number): number {
    return this.incompleteGamma(df / 2, x / 2);
  }
  
  /**
   * Incomplete gamma function (regularized)
   */
  static incompleteGamma(a: number, x: number): number {
    if (x < 0 || a <= 0) return NaN;
    if (x === 0) return 0;
    
    if (x < a + 1) {
      // Series representation
      let sum = 1 / a;
      let term = sum;
      for (let n = 1; n < 100; n++) {
        term *= x / (a + n);
        sum += term;
        if (Math.abs(term) < Math.abs(sum) * 1e-10) break;
      }
      return sum * Math.exp(-x + a * Math.log(x) - this.logGamma(a));
    } else {
      // Continued fraction
      let b = x + 1 - a;
      let c = 1 / 1e-30;
      let d = 1 / b;
      let h = d;
      for (let i = 1; i < 100; i++) {
        const an = -i * (i - a);
        b += 2;
        d = an * d + b;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = b + an / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        const del = d * c;
        h *= del;
        if (Math.abs(del - 1) < 1e-10) break;
      }
      return 1 - Math.exp(-x + a * Math.log(x) - this.logGamma(a)) * h;
    }
  }
  
  /**
   * Effect size interpretation (Cohen's conventions)
   */
  static interpretCohensD(d: number): "negligible" | "small" | "medium" | "large" | "very_large" {
    const abs = Math.abs(d);
    if (abs < 0.2) return "negligible";
    if (abs < 0.5) return "small";
    if (abs < 0.8) return "medium";
    if (abs < 1.2) return "large";
    return "very_large";
  }
  
  static interpretR(r: number): "negligible" | "small" | "medium" | "large" | "very_large" {
    const abs = Math.abs(r);
    if (abs < 0.1) return "negligible";
    if (abs < 0.3) return "small";
    if (abs < 0.5) return "medium";
    if (abs < 0.7) return "large";
    return "very_large";
  }
  
  static interpretEtaSquared(eta2: number): "negligible" | "small" | "medium" | "large" | "very_large" {
    if (eta2 < 0.01) return "negligible";
    if (eta2 < 0.06) return "small";
    if (eta2 < 0.14) return "medium";
    return "large";
  }
}
