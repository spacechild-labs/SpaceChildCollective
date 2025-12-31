# 🧠 Statistical Analysis & Psychometrics Engine

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=for-the-badge&logo=zod&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)

**A comprehensive, research-grade statistical analysis engine for consciousness research and psychometric applications.**

*Where rigorous methodology meets the exploration of mind.*

[Features](#-features) • [Methods](#-methods-26) • [Quick Start](#-quick-start) • [API](#-api-reference) • [Philosophy](#-philosophy)

</div>

---

## ✨ Features

### 🎯 **Transparent & Reproducible**
Every analysis includes full provenance tracking—dataset hashes, software versions, parameter choices, and timestamps. Your research is reproducible by design.

### 📊 **Automatic Design Detection**
Simply provide your data. The engine infers study design (between/within subjects, longitudinal, psychometric), recommends appropriate methods, and explains *why*.

### 🔬 **Assumption Checking**
Automatic testing of statistical assumptions (normality, homoscedasticity, sphericity) with clear diagnostics and robust alternatives when violations occur.

### 📝 **APA-Style Reporting**
Generate publication-ready reports with properly formatted statistics, effect sizes, confidence intervals, and interpretations following APA 7th edition guidelines.

### 🧬 **Consciousness-Specific Methods**
Purpose-built analyses for consciousness research: integrated information (Φ), signal detection theory, temporal coherence, and more.

### 🔗 **Modular & Extensible**
Clean TypeScript architecture with a simple interface for adding custom methods. Each analysis method is self-contained and testable.

---

## 📈 Methods (33)

### Inferential Statistics

| Method | Description | Key Output |
|--------|-------------|------------|
| **T-Tests** | Independent, paired, Welch's | t, df, p, Cohen's d |
| **ANOVA** | One-way, repeated measures | F, η², ω², post-hoc |
| **Non-Parametric** | Mann-Whitney U, Wilcoxon | U/W, r effect size |
| **Chi-Square** | Independence, Fisher's exact | χ², Cramér's V, OR |
| **Correlation** | Pearson, Spearman, matrix | r, 95% CI, p |
| **Regression** | Linear, mixed effects | β, R², AIC/BIC |
| **Mediation** | Baron & Kenny + bootstrap | a×b, 95% CI, Sobel z |
| **Moderation** | Interaction effects | b₃, ΔR², simple slopes |

### Bayesian Inference

| Method | Description | Key Output |
|--------|-------------|------------|
| **Bayesian T-Test** | JZS prior, independent samples | BF₁₀, posterior P(H1) |
| **Bayesian Paired T** | Within-subjects comparison | BF₁₀, credible interval |
| **Bayesian Correlation** | Evidence for association | BF₁₀, posterior r |

### Psychometrics

| Method | Description | Key Output |
|--------|-------------|------------|
| **Reliability** | Cronbach's α, McDonald's ω | α, ω, item-total r |
| **Factor Analysis** | EFA, CFA | Loadings, fit indices |
| **IRT (Dichotomous)** | Rasch (1PL), 2PL, 3PL | a, b, c parameters |
| **IRT (Polytomous)** | Graded Response Model | a, thresholds |
| **Network** | Gaussian Graphical Model | Centrality, density |

### Consciousness Research

| Method | Description | Key Output |
|--------|-------------|------------|
| **Phi Analysis** | Integrated information | Φ, threshold analysis |
| **Signal Detection** | Sensitivity & bias | d', criterion, β |
| **Coherence** | Temporal consistency | Coherence index, z |

---

## 🚀 Quick Start

```typescript
import { statisticsEngine } from './services/statistics';

// Quick analysis - let the engine choose the method
const result = await statisticsEngine.quickAnalyze(
  experimentData,
  'consciousness_score',  // outcome
  'condition',            // predictor
  'confirmatory'          // mode
);

console.log(result.apaReport);
// "An independent samples t-test revealed a significant difference 
//  between conditions, t(98) = 3.42, p = .001, d = 0.68 [95% CI: 0.28, 1.08]."
```

### Full Configuration

```typescript
const result = await statisticsEngine.analyze({
  dataset: {
    data: experimentData,
    metadata: {
      name: "Consciousness Experiment 2024",
      description: "Testing integrated information hypothesis"
    }
  },
  outcomes: ['phi_value', 'coherence_score'],
  predictors: ['meditation_experience', 'age'],
  groupingVariables: ['condition'],
  mode: 'confirmatory',
  alpha: 0.05,
  preregistered: true,
  hypotheses: [{
    id: 'H1',
    description: 'Phi values will be higher in meditation condition',
    direction: 'greater'
  }]
});

// Access results
console.log(result.apaReport);           // Publication-ready text
console.log(result.machineReport);       // Structured JSON
console.log(result.recommendations);     // Method suggestions
console.log(result.diagnostics);         // Assumption checks
console.log(result.provenance);          // Full audit trail
```

### Consciousness-Specific Analysis

```typescript
// Integrated Information (Phi) Analysis
const phiResult = await statisticsEngine.analyze({
  dataset: { data: brainStateData },
  outcomes: ['phi_value'],
  groupingVariables: ['consciousness_state'],
  preferredMethod: 'phi_analysis'
});

// Signal Detection for Consciousness Experiments
const sdtResult = await statisticsEngine.analyze({
  dataset: { data: trialData },
  outcomes: ['response'],
  predictors: ['signal_present'],
  preferredMethod: 'signal_detection'
});
// Output: d' = 1.24, criterion = 0.15, β = 1.08
```

---

## 🔌 API Reference

### REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/statistics/analyze` | POST | Full analysis pipeline |
| `/api/statistics/quick-analyze` | POST | Minimal configuration |
| `/api/statistics/recommend` | POST | Get method recommendations |
| `/api/statistics/check-assumptions` | POST | Test assumptions only |
| `/api/statistics/parse-design` | POST | Infer study design |
| `/api/statistics/descriptives` | POST | Descriptive statistics |
| `/api/statistics/methods` | GET | List available methods |
| `/api/statistics/config` | GET/PATCH | Engine configuration |

### Request Example

```bash
curl -X POST http://localhost:5000/api/statistics/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "dataset": {
      "data": [{"score": 85, "group": "A"}, {"score": 72, "group": "B"}]
    },
    "outcomes": ["score"],
    "groupingVariables": ["group"],
    "mode": "exploratory"
  }'
```

---

## 🏗️ Architecture

```
server/services/statistics/
├── core/
│   ├── StatisticsEngine.ts      # Main orchestrator
│   ├── DesignParser.ts          # Study design inference
│   ├── MethodRecommender.ts     # Transparent method selection
│   └── ProvenanceLedger.ts      # Reproducibility tracking
├── diagnostics/
│   └── AssumptionChecker.ts     # Automatic assumption testing
├── methods/
│   ├── AnalysisMethod.ts        # Interface + StatUtils
│   ├── inferential/             # T-tests, ANOVA, regression, etc.
│   ├── psychometrics/           # Reliability, factor analysis, IRT
│   └── consciousness/           # Phi, SDT, coherence
├── reporting/
│   └── APAReporter.ts           # APA-style report generation
└── index.ts                     # Public exports
```

### Adding Custom Methods

```typescript
import { AnalysisMethod, StatUtils } from './methods/AnalysisMethod';

export class MyCustomMethod implements AnalysisMethod {
  async execute(data, spec, design) {
    // Your analysis logic
    const mean = StatUtils.mean(values);
    const sd = StatUtils.sd(values);
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters: [{ name: "Mean", estimate: mean }],
      effectSizes: [{ type: "cohens_d", value: effectSize }],
      conclusion: "Results summary...",
      interpretation: "Plain language explanation...",
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions() { return ["normality"]; }
  getMinimumSampleSize() { return 30; }
}

// Register with engine
statisticsEngine.registerMethod("my_custom", new MyCustomMethod());
```

---

## 🌟 Philosophy

This engine was built with a clear philosophy:

### **Transparency Over Black Boxes**
Every method recommendation comes with a rationale. Every assumption check is explained. Researchers should understand *why* a particular analysis was chosen.

### **Reproducibility By Default**
Full provenance tracking isn't optional—it's built into every analysis. Dataset hashes, timestamps, software versions, and complete parameter specifications ensure any analysis can be exactly reproduced.

### **Effect Sizes Matter**
P-values are necessary but insufficient. Every analysis reports appropriate effect sizes with confidence intervals and plain-language interpretations.

### **Consciousness Research Deserves Better Tools**
The study of consciousness requires specialized methods. This engine includes purpose-built analyses for integrated information theory, signal detection in consciousness experiments, and temporal coherence measurement.

### **Open Science Ready**
Pre-registration support, complete audit trails, and machine-readable outputs make this engine ideal for open science practices.

---

## 📚 Statistical Utilities

The `StatUtils` class provides foundational functions:

```typescript
import { StatUtils } from './methods/AnalysisMethod';

// Descriptive
StatUtils.mean(values);
StatUtils.variance(values);
StatUtils.sd(values);
StatUtils.median(values);
StatUtils.percentile(values, 0.75);
StatUtils.skewness(values);
StatUtils.kurtosis(values);

// Inferential
StatUtils.correlation(x, y);
StatUtils.covariance(x, y);
StatUtils.tPValue(t, df);
StatUtils.fCDF(f, df1, df2);
StatUtils.chi2CDF(chi2, df);
StatUtils.normalCDF(z);
StatUtils.normalQuantile(p);

// Effect Size Interpretation
StatUtils.interpretCohensD(d);      // "small" | "medium" | "large"
StatUtils.interpretR(r);
StatUtils.interpretEtaSquared(eta2);
```

---

## 🔮 Roadmap

- [x] ~~Bayesian alternatives (Bayesian t-test, correlation)~~
- [x] ~~Moderation analysis (interaction effects)~~
- [x] ~~Advanced IRT (3PL, graded response)~~
- [ ] Full Structural Equation Modeling
- [ ] Longitudinal models (growth curves)
- [ ] DIF analysis for IRT
- [ ] Power analysis integration
- [ ] Interactive visualization components
- [ ] Bayesian regression

---

## 🤝 Contributing

Contributions are welcome! Whether it's:
- Adding new statistical methods
- Improving documentation
- Reporting bugs
- Suggesting features

Please ensure any new methods include:
1. Proper assumption checking
2. Effect size calculation
3. APA-style interpretation
4. Minimum sample size specification

---

## 📄 License

MIT License - Use freely in your consciousness research.

---

<div align="center">

**Built for researchers exploring the frontiers of mind.**

*"The measure of intelligence is the ability to change." — Albert Einstein*

</div>
