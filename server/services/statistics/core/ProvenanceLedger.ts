/**
 * Provenance Ledger
 * 
 * Records full provenance for every analysis run to ensure reproducibility.
 * No result may exist without provenance.
 */

import { createHash, randomUUID } from "crypto";
import type {
  ProvenanceRecord,
  AnalysisSpec,
  AnalysisResult
} from "@shared/statistics-schema";
import type { DatasetInput } from "./StatisticsEngine";

interface ProvenanceInput {
  runId: string;
  dataset: DatasetInput;
  analysisSpec: AnalysisSpec;
  result: AnalysisResult;
  startTime: number;
  endTime: number;
  parentRunId?: string;
  notes?: string;
}

export class ProvenanceLedger {
  private records: Map<string, ProvenanceRecord> = new Map();
  
  /**
   * Record provenance for an analysis run
   */
  async record(input: ProvenanceInput): Promise<ProvenanceRecord> {
    const {
      runId,
      dataset,
      analysisSpec,
      result,
      startTime,
      endTime,
      parentRunId,
      notes
    } = input;
    
    // Compute dataset hash
    const datasetHash = createHash("sha256")
      .update(JSON.stringify(dataset.data))
      .digest("hex");
    
    // Compute result hash
    const resultHash = createHash("sha256")
      .update(JSON.stringify(result))
      .digest("hex");
    
    // Get software versions
    const softwareVersions = this.getSoftwareVersions();
    
    // Extract random seeds if present
    const randomSeeds: Record<string, number> = {};
    if (analysisSpec.randomSeed !== undefined) {
      randomSeeds.analysis = analysisSpec.randomSeed;
    }
    if (analysisSpec.bootstrapIterations !== undefined) {
      randomSeeds.bootstrap = analysisSpec.bootstrapIterations;
    }
    
    const record: ProvenanceRecord = {
      id: randomUUID(),
      analysisRunId: runId,
      
      // Data provenance
      datasetHash,
      datasetFilters: undefined, // Would be populated if filters were applied
      datasetRowCount: dataset.data.length,
      datasetColumnCount: Object.keys(dataset.data[0] || {}).length,
      
      // Analysis specification (full copy for reproducibility)
      analysisSpec,
      
      // Execution details
      softwareVersions,
      randomSeeds: Object.keys(randomSeeds).length > 0 ? randomSeeds : undefined,
      executionStartTime: new Date(startTime).toISOString(),
      executionEndTime: new Date(endTime).toISOString(),
      executionDuration: endTime - startTime,
      
      // Results
      resultId: result.id,
      resultHash,
      
      // Artifacts (would be populated with actual file references)
      artifacts: [],
      
      // Audit trail
      createdBy: undefined, // Would be populated with user ID
      createdAt: new Date().toISOString(),
      parentRunId,
      notes
    };
    
    // Store record
    this.records.set(record.id, record);
    
    console.log(`📋 [ProvenanceLedger] Recorded provenance for run ${runId}`);
    
    return record;
  }
  
  /**
   * Get provenance record by ID
   */
  getRecord(id: string): ProvenanceRecord | undefined {
    return this.records.get(id);
  }
  
  /**
   * Get provenance record by analysis run ID
   */
  getByRunId(runId: string): ProvenanceRecord | undefined {
    for (const record of this.records.values()) {
      if (record.analysisRunId === runId) {
        return record;
      }
    }
    return undefined;
  }
  
  /**
   * Get all provenance records for a dataset hash
   */
  getByDatasetHash(hash: string): ProvenanceRecord[] {
    return Array.from(this.records.values())
      .filter(r => r.datasetHash === hash);
  }
  
  /**
   * Verify that a result matches its provenance
   */
  verifyResult(result: AnalysisResult, provenanceId: string): boolean {
    const record = this.records.get(provenanceId);
    if (!record) {
      return false;
    }
    
    const currentHash = createHash("sha256")
      .update(JSON.stringify(result))
      .digest("hex");
    
    return currentHash === record.resultHash;
  }
  
  /**
   * Get software versions for provenance
   */
  private getSoftwareVersions(): Record<string, string> {
    return {
      "statistics-engine": "1.0.0",
      "node": process.version,
      "platform": process.platform,
      "arch": process.arch
    };
  }
  
  /**
   * Export provenance record as JSON
   */
  exportRecord(id: string): string | null {
    const record = this.records.get(id);
    if (!record) return null;
    return JSON.stringify(record, null, 2);
  }
  
  /**
   * Import provenance record from JSON
   */
  importRecord(json: string): ProvenanceRecord {
    const record = JSON.parse(json) as ProvenanceRecord;
    this.records.set(record.id, record);
    return record;
  }
  
  /**
   * Get all records (for debugging/admin)
   */
  getAllRecords(): ProvenanceRecord[] {
    return Array.from(this.records.values());
  }
  
  /**
   * Clear old records (for memory management)
   */
  clearOldRecords(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleared = 0;
    
    for (const [id, record] of this.records) {
      const createdAt = new Date(record.createdAt).getTime();
      if (createdAt < cutoff) {
        this.records.delete(id);
        cleared++;
      }
    }
    
    return cleared;
  }
}
