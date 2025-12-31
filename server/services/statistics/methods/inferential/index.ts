/**
 * Inferential Statistics Methods
 * 
 * Exports all inferential statistical methods.
 */

export { TTestMethod, PairedTTestMethod, WelchTTestMethod } from "./TTests";
export { ANOVAMethod } from "./ANOVA";
export { RepeatedMeasuresANOVAMethod } from "./RepeatedMeasuresANOVA";
export { LinearRegressionMethod } from "./Regression";
export { MannWhitneyMethod, WilcoxonMethod } from "./NonParametric";
export { ChiSquareMethod, FisherExactMethod } from "./ChiSquare";
export { PearsonCorrelationMethod, SpearmanCorrelationMethod, CorrelationMatrixMethod } from "./Correlation";
