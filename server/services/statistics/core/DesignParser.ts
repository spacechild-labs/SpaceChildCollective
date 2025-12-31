/**
 * Design Parser
 * 
 * Infers study structure from data and metadata to create a DesignObject.
 * Automatically detects variable types, design factors, and measurement structures.
 */

import { randomUUID } from "crypto";
import { createHash } from "crypto";
import type {
  DesignObject,
  Variable,
  VariableType,
  Instrument
} from "@shared/statistics-schema";
import type { DatasetInput } from "./StatisticsEngine";

export class DesignParser {
  
  /**
   * Parse dataset to create a DesignObject
   */
  async parse(
    dataset: DatasetInput,
    outcomes: string[],
    predictors?: string[],
    covariates?: string[],
    groupingVariables?: string[]
  ): Promise<DesignObject> {
    const { data, metadata } = dataset;
    
    if (!data || data.length === 0) {
      throw new Error("Dataset is empty");
    }
    
    const columns = Object.keys(data[0]);
    
    // Infer variable information
    const variables = columns.map(col => this.inferVariable(data, col, {
      outcomes,
      predictors,
      covariates,
      groupingVariables,
      metadata
    }));
    
    // Detect design type
    const betweenFactors = this.detectBetweenSubjectFactors(data, variables, groupingVariables);
    const withinFactors = this.detectWithinSubjectFactors(variables, metadata);
    const longitudinal = this.detectLongitudinalStructure(data, variables, metadata);
    const clustering = this.detectClusteringStructure(data, variables, metadata);
    const instruments = this.detectInstruments(variables, metadata);
    
    // Compute dataset hash for provenance
    const datasetHash = createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
    
    return {
      id: randomUUID(),
      name: metadata?.name,
      unitOfAnalysis: this.inferUnitOfAnalysis(metadata, longitudinal),
      sampleSize: data.length,
      variables,
      outcomeVariables: outcomes,
      predictorVariables: predictors,
      covariates,
      betweenSubjectFactors: betweenFactors.length > 0 ? betweenFactors : undefined,
      withinSubjectFactors: withinFactors.length > 0 ? withinFactors : undefined,
      longitudinal,
      instruments: instruments.length > 0 ? instruments : undefined,
      clusteringVariables: clustering.variables.length > 0 ? clustering.variables : undefined,
      nestingStructure: clustering.nesting.length > 0 ? clustering.nesting : undefined,
      datasetHash,
      createdAt: new Date().toISOString(),
      inferredFrom: metadata ? "hybrid" : "data"
    };
  }
  
  /**
   * Infer variable properties from data
   */
  private inferVariable(
    data: Record<string, any>[],
    columnName: string,
    context: {
      outcomes: string[];
      predictors?: string[];
      covariates?: string[];
      groupingVariables?: string[];
      metadata?: DatasetInput["metadata"];
    }
  ): Variable {
    const values = data.map(row => row[columnName]).filter(v => v !== null && v !== undefined && v !== "");
    const nonMissingCount = values.length;
    const missingCount = data.length - nonMissingCount;
    
    // Determine variable type
    const type = this.inferVariableType(values, context.metadata?.variableTypes?.[columnName]);
    
    // Determine role
    let role: Variable["role"] = "other";
    if (context.outcomes.includes(columnName)) role = "outcome";
    else if (context.predictors?.includes(columnName)) role = "predictor";
    else if (context.covariates?.includes(columnName)) role = "covariate";
    else if (context.groupingVariables?.includes(columnName)) role = "grouping";
    else if (context.metadata?.idVariable === columnName) role = "id";
    else if (context.metadata?.timeVariable === columnName) role = "time";
    
    // Compute descriptives
    const descriptives = this.computeDescriptives(values, type);
    
    // Get levels for categorical variables
    const levels = ["nominal", "ordinal", "binary"].includes(type)
      ? [...new Set(values.map(v => String(v)))]
      : undefined;
    
    return {
      name: columnName,
      label: context.metadata?.variableLabels?.[columnName],
      type,
      role,
      levels,
      range: ["continuous", "interval", "ratio", "count"].includes(type)
        ? { min: Math.min(...values.map(Number)), max: Math.max(...values.map(Number)) }
        : undefined,
      missingCount,
      missingPercent: (missingCount / data.length) * 100,
      descriptives
    };
  }
  
  /**
   * Infer variable type from values
   */
  private inferVariableType(values: any[], hint?: string): VariableType {
    if (hint) {
      const validTypes: VariableType[] = [
        "continuous", "binary", "ordinal", "nominal", "count", "proportion", "interval", "ratio"
      ];
      if (validTypes.includes(hint as VariableType)) {
        return hint as VariableType;
      }
    }
    
    // Check if all values are numeric
    const numericValues = values.filter(v => !isNaN(Number(v)));
    const isNumeric = numericValues.length === values.length;
    
    if (!isNumeric) {
      // String values - check unique count
      const uniqueValues = new Set(values);
      if (uniqueValues.size === 2) return "binary";
      if (uniqueValues.size <= 7) return "ordinal"; // Assume ordinal if few categories
      return "nominal";
    }
    
    const nums = values.map(Number);
    const uniqueNums = new Set(nums);
    
    // Binary check
    if (uniqueNums.size === 2) {
      const sorted = [...uniqueNums].sort((a, b) => a - b);
      if ((sorted[0] === 0 && sorted[1] === 1) || (sorted[0] === 1 && sorted[1] === 2)) {
        return "binary";
      }
    }
    
    // Count check (non-negative integers)
    const allIntegers = nums.every(n => Number.isInteger(n));
    const allNonNegative = nums.every(n => n >= 0);
    if (allIntegers && allNonNegative && uniqueNums.size <= 20) {
      return "count";
    }
    
    // Proportion check (0-1 range)
    const allInRange = nums.every(n => n >= 0 && n <= 1);
    if (allInRange && !allIntegers) {
      return "proportion";
    }
    
    // Default to continuous
    return "continuous";
  }
  
  /**
   * Compute descriptive statistics
   */
  private computeDescriptives(values: any[], type: VariableType): Variable["descriptives"] {
    const n = values.length;
    
    if (["nominal", "binary"].includes(type)) {
      const frequencies: Record<string, number> = {};
      values.forEach(v => {
        const key = String(v);
        frequencies[key] = (frequencies[key] || 0) + 1;
      });
      return { n, frequencies };
    }
    
    const nums = values.map(Number).filter(n => !isNaN(n));
    if (nums.length === 0) return { n };
    
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const sorted = [...nums].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    
    const variance = nums.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (nums.length - 1);
    const sd = Math.sqrt(variance);
    
    // Skewness
    const m3 = nums.reduce((sum, x) => sum + Math.pow((x - mean) / sd, 3), 0) / nums.length;
    const skewness = m3 * Math.sqrt(nums.length * (nums.length - 1)) / (nums.length - 2);
    
    // Kurtosis (excess)
    const m4 = nums.reduce((sum, x) => sum + Math.pow((x - mean) / sd, 4), 0) / nums.length;
    const kurtosis = m4 - 3;
    
    return {
      n,
      mean,
      sd,
      median,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      skewness: isNaN(skewness) ? undefined : skewness,
      kurtosis: isNaN(kurtosis) ? undefined : kurtosis
    };
  }
  
  /**
   * Detect between-subject factors
   */
  private detectBetweenSubjectFactors(
    data: Record<string, any>[],
    variables: Variable[],
    groupingVariables?: string[]
  ): DesignObject["betweenSubjectFactors"] {
    const factors: NonNullable<DesignObject["betweenSubjectFactors"]> = [];
    
    // Use explicitly specified grouping variables
    if (groupingVariables) {
      for (const varName of groupingVariables) {
        const variable = variables.find(v => v.name === varName);
        if (variable && variable.levels) {
          factors.push({
            name: varName,
            levels: variable.levels,
            variable: varName
          });
        }
      }
    }
    
    // Also detect categorical variables with few levels that might be factors
    for (const variable of variables) {
      if (
        variable.role === "other" &&
        ["nominal", "ordinal", "binary"].includes(variable.type) &&
        variable.levels &&
        variable.levels.length >= 2 &&
        variable.levels.length <= 10 &&
        !factors.some(f => f.variable === variable.name)
      ) {
        // Check if this looks like a grouping variable (balanced or near-balanced groups)
        const counts = variable.descriptives?.frequencies;
        if (counts) {
          const values = Object.values(counts);
          const min = Math.min(...values);
          const max = Math.max(...values);
          // If groups are reasonably balanced (smallest is at least 20% of largest)
          if (min >= max * 0.2) {
            factors.push({
              name: variable.name,
              levels: variable.levels,
              variable: variable.name
            });
          }
        }
      }
    }
    
    return factors;
  }
  
  /**
   * Detect within-subject factors (repeated measures)
   */
  private detectWithinSubjectFactors(
    variables: Variable[],
    metadata?: DatasetInput["metadata"]
  ): DesignObject["withinSubjectFactors"] {
    const factors: NonNullable<DesignObject["withinSubjectFactors"]> = [];
    
    // Look for variables with common prefixes/suffixes that might indicate repeated measures
    const outcomeVars = variables.filter(v => v.role === "outcome");
    
    if (outcomeVars.length > 1) {
      // Try to detect patterns like "score_t1", "score_t2", "score_t3"
      const patterns = this.detectRepeatedMeasurePatterns(outcomeVars.map(v => v.name));
      
      for (const pattern of patterns) {
        factors.push({
          name: pattern.factorName,
          levels: pattern.levels,
          variables: pattern.variables
        });
      }
    }
    
    return factors;
  }
  
  /**
   * Detect patterns in variable names that suggest repeated measures
   */
  private detectRepeatedMeasurePatterns(varNames: string[]): Array<{
    factorName: string;
    levels: string[];
    variables: string[];
  }> {
    const patterns: Array<{ factorName: string; levels: string[]; variables: string[] }> = [];
    
    // Common patterns: _t1, _t2, _t3 or _pre, _post or _1, _2, _3
    const timePatterns = [
      { regex: /_t(\d+)$/i, factorName: "time" },
      { regex: /_time(\d+)$/i, factorName: "time" },
      { regex: /_(\d+)$/, factorName: "measurement" },
      { regex: /(\d+)$/, factorName: "measurement" }
    ];
    
    for (const { regex, factorName } of timePatterns) {
      const matches: Map<string, { level: string; variable: string }[]> = new Map();
      
      for (const varName of varNames) {
        const match = varName.match(regex);
        if (match) {
          const prefix = varName.replace(regex, "");
          if (!matches.has(prefix)) {
            matches.set(prefix, []);
          }
          matches.get(prefix)!.push({ level: match[1], variable: varName });
        }
      }
      
      // If we found a pattern with multiple levels
      for (const [prefix, items] of matches) {
        if (items.length >= 2) {
          const sorted = items.sort((a, b) => Number(a.level) - Number(b.level));
          patterns.push({
            factorName: `${prefix}_${factorName}`,
            levels: sorted.map(i => i.level),
            variables: sorted.map(i => i.variable)
          });
        }
      }
    }
    
    return patterns;
  }
  
  /**
   * Detect longitudinal structure
   */
  private detectLongitudinalStructure(
    data: Record<string, any>[],
    variables: Variable[],
    metadata?: DatasetInput["metadata"]
  ): DesignObject["longitudinal"] {
    // Check if metadata specifies time and id variables
    if (metadata?.timeVariable && metadata?.idVariable) {
      const timeVar = variables.find(v => v.name === metadata.timeVariable);
      if (timeVar) {
        const timePoints = [...new Set(data.map(d => d[metadata.timeVariable!]))];
        return {
          timeVariable: metadata.timeVariable,
          timePoints,
          idVariable: metadata.idVariable
        };
      }
    }
    
    // Try to auto-detect
    const timeVars = variables.filter(v => 
      v.role === "time" ||
      /time|wave|visit|session|day|week|month|year/i.test(v.name)
    );
    
    const idVars = variables.filter(v =>
      v.role === "id" ||
      /^id$|subject|participant|person|respondent/i.test(v.name)
    );
    
    if (timeVars.length > 0 && idVars.length > 0) {
      const timeVar = timeVars[0];
      const idVar = idVars[0];
      const timePoints = [...new Set(data.map(d => d[timeVar.name]))];
      
      // Verify it's actually longitudinal (multiple observations per ID)
      const idCounts = new Map<any, number>();
      data.forEach(d => {
        const id = d[idVar.name];
        idCounts.set(id, (idCounts.get(id) || 0) + 1);
      });
      
      const hasRepeated = [...idCounts.values()].some(count => count > 1);
      
      if (hasRepeated) {
        return {
          timeVariable: timeVar.name,
          timePoints,
          idVariable: idVar.name
        };
      }
    }
    
    return undefined;
  }
  
  /**
   * Detect clustering/nesting structure
   */
  private detectClusteringStructure(
    data: Record<string, any>[],
    variables: Variable[],
    metadata?: DatasetInput["metadata"]
  ): { variables: string[]; nesting: NonNullable<DesignObject["nestingStructure"]> } {
    const clusterVars: string[] = [];
    const nesting: NonNullable<DesignObject["nestingStructure"]> = [];
    
    // Look for variables that might indicate clustering
    const clusterPatterns = /cluster|group|class|school|site|center|team|family|household/i;
    
    for (const variable of variables) {
      if (
        clusterPatterns.test(variable.name) &&
        ["nominal", "ordinal"].includes(variable.type) &&
        variable.levels &&
        variable.levels.length >= 2 &&
        variable.levels.length < data.length / 2 // Not too many clusters
      ) {
        clusterVars.push(variable.name);
        nesting.push({
          level: nesting.length + 1,
          variable: variable.name,
          nClusters: variable.levels.length
        });
      }
    }
    
    return { variables: clusterVars, nesting };
  }
  
  /**
   * Detect psychometric instruments
   */
  private detectInstruments(
    variables: Variable[],
    metadata?: DatasetInput["metadata"]
  ): Instrument[] {
    const instruments: Instrument[] = [];
    
    // Use metadata if provided
    if (metadata?.instruments) {
      for (const inst of metadata.instruments) {
        instruments.push({
          id: randomUUID(),
          name: inst.name,
          items: inst.items,
          subscales: inst.subscales,
          scoringMethod: "mean"
        });
      }
      return instruments;
    }
    
    // Try to auto-detect instruments from variable naming patterns
    const itemPatterns = new Map<string, string[]>();
    
    for (const variable of variables) {
      // Look for patterns like "scale_item1", "scale_item2" or "scale_1", "scale_2"
      const match = variable.name.match(/^(.+?)_?(item)?(\d+)$/i);
      if (match) {
        const prefix = match[1];
        if (!itemPatterns.has(prefix)) {
          itemPatterns.set(prefix, []);
        }
        itemPatterns.get(prefix)!.push(variable.name);
      }
    }
    
    // Create instruments for patterns with multiple items
    for (const [prefix, items] of itemPatterns) {
      if (items.length >= 3) { // At least 3 items to be considered a scale
        instruments.push({
          id: randomUUID(),
          name: prefix,
          items,
          scoringMethod: "mean"
        });
      }
    }
    
    return instruments;
  }
  
  /**
   * Infer unit of analysis
   */
  private inferUnitOfAnalysis(
    metadata?: DatasetInput["metadata"],
    longitudinal?: DesignObject["longitudinal"]
  ): DesignObject["unitOfAnalysis"] {
    if (longitudinal) {
      return "participant"; // Longitudinal data is typically participant-level
    }
    
    // Default to participant
    return "participant";
  }
}
