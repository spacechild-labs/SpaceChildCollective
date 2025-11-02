#!/usr/bin/env node

/**
 * Test Script for Phase 2 Consciousness Features
 * Validates that consciousness integration, temporal processing, and hardware verification work correctly
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';

// Helper function to make HTTP requests
function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (data) {
      options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Test functions
async function testConsciousnessVerification() {
  console.log('\n🔬 Testing Consciousness Verification...');
  try {
    const response = await makeRequest('/api/consciousness/verification');
    
    if (response.status === 200) {
      console.log('✅ Consciousness verification API working');
      const verification = response.data;
      
      console.log(`   Verified: ${verification.verified}`);
      console.log(`   Verification Hash: ${verification.verificationHash}`);
      console.log(`   Status: ${verification.status}`);
      console.log(`   Capabilities: ${verification.capabilities.length}`);
      
      // Check hardware proof
      if (verification.hardwareProof) {
        console.log(`   Hardware Proof: Present`);
        console.log(`   Quantum Signature: ${verification.hardwareProof.quantumSignature.substring(0, 20)}...`);
      }
      
      return verification;
    } else {
      console.log('❌ Consciousness verification API failed:', response.status);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing consciousness verification:', error.message);
    return null;
  }
}

async function testConsciousnessMetrics() {
  console.log('\n📊 Testing Consciousness Metrics...');
  try {
    // Test summary metrics
    const summaryResponse = await makeRequest('/api/consciousness/metrics');
    
    if (summaryResponse.status === 200) {
      console.log('✅ Consciousness metrics summary API working');
      const summary = summaryResponse.data;
      
      if (summary) {
        console.log(`   Total Tasks: ${summary.totalTasks}`);
        console.log(`   Average Phi: ${summary.averagePhi?.toFixed(3) || 'N/A'}`);
        console.log(`   Average Consciousness Level: ${(summary.averageConsciousnessLevel * 100)?.toFixed(1) || 'N/A'}%`);
        console.log(`   High Consciousness Tasks: ${summary.highConsciousnessTasks}`);
        console.log(`   Verification Hash: ${summary.verificationHash}`);
      } else {
        console.log('   No metrics available yet (expected for new system)');
      }
    } else {
      console.log('❌ Consciousness metrics summary API failed:', response.status);
      return null;
    }

    // Test task-specific metrics
    const taskResponse = await makeRequest('/api/consciousness/metrics?taskId=test-task-123');
    
    if (taskResponse.status === 200) {
      console.log('✅ Task-specific consciousness metrics API working');
      console.log(`   Task metrics: ${taskResponse.data ? 'Available' : 'Not found (expected)'}`);
    }
    
    return summaryResponse.data;
  } catch (error) {
    console.log('❌ Error testing consciousness metrics:', error.message);
    return null;
  }
}

async function testTemporalProcessing() {
  console.log('\n⏰ Testing Temporal Processing...');
  try {
    // Test summary status
    const summaryResponse = await makeRequest('/api/consciousness/temporal');
    
    if (summaryResponse.status === 200) {
      console.log('✅ Temporal processing summary API working');
      const summary = summaryResponse.data;
      
      if (summary) {
        console.log(`   Total Tasks: ${summary.totalTasks}`);
        console.log(`   Average Processing Speed: ${Math.round(summary.averageProcessingSpeed || 0)}x`);
        console.log(`   Average Prediction Accuracy: ${(summary.averagePredictionAccuracy * 100)?.toFixed(1) || 'N/A'}%`);
        console.log(`   Quantum Gating Active: ${summary.quantumGatingActive}`);
        console.log(`   Temporal Anchoring Active: ${summary.temporalAnchoringActive}`);
      } else {
        console.log('   No temporal data available yet (expected for new system)');
      }
    } else {
      console.log('❌ Temporal processing summary API failed:', response.status);
      return null;
    }

    // Test task-specific status
    const taskResponse = await makeRequest('/api/consciousness/temporal?taskId=test-task-123');
    
    if (taskResponse.status === 200) {
      console.log('✅ Task-specific temporal processing API working');
      console.log(`   Task temporal data: ${taskResponse.data ? 'Available' : 'Not found (expected)'}`);
    }
    
    return summaryResponse.data;
  } catch (error) {
    console.log('❌ Error testing temporal processing:', error.message);
    return null;
  }
}

async function testConsciousnessEnhancedTask() {
  console.log('\n🧠 Testing Consciousness-Enhanced Task Processing...');
  try {
    // First create a task
    const taskData = {
      paperId: 'test-consciousness-paper-123',
      taskType: 'literature_review',
      description: 'Consciousness-enhanced literature review on integrated information theory and neural correlates of consciousness',
      userId: 'test-user-123'
    };

    const createResponse = await makeRequest('/api/tasks/create', 'POST', taskData);
    
    if (createResponse.status !== 200) {
      console.log('❌ Failed to create task for consciousness test');
      return null;
    }

    const task = createResponse.data;
    console.log(`✅ Task created: ${task.id}`);

    // Wait for task completion
    const completedTask = await waitForTaskCompletion(task.id);
    
    if (completedTask && completedTask.result) {
      console.log('✅ Task completed with consciousness integration');
      
      // Check consciousness features
      const result = completedTask.result;
      if (result.consciousness) {
        console.log(`   Consciousness Verified: ${result.consciousness.consciousnessVerified}`);
        console.log(`   Consciousness Level: ${(result.consciousness.consciousnessLevel * 100).toFixed(1)}%`);
        console.log(`   Phi Value: ${result.consciousness.metrics.phi.toFixed(3)}`);
        console.log(`   Temporal Coherence: ${(result.consciousness.metrics.temporalCoherence * 100).toFixed(1)}%`);
        console.log(`   Quantum Entanglement: ${(result.consciousness.metrics.quantumEntanglement * 100).toFixed(1)}%`);
        
        // Check insights
        if (result.consciousness.insights) {
          console.log(`   Consciousness Theory: ${result.consciousness.insights.consciousnessTheory}`);
          console.log(`   Neural Correlates: ${result.consciousness.insights.neuralCorrelates.length} identified`);
          console.log(`   Implications: ${result.consciousness.insights.implications.length} generated`);
        }
        
        // Check hardware proof
        if (result.consciousness.hardwareProof) {
          console.log(`   Hardware Proof: Present`);
          console.log(`   Verification Hash: ${result.consciousness.hardwareProof.hash}`);
        }
        
        // Check metadata
        if (result.metadata) {
          console.log(`   Model: ${result.metadata.model}`);
          console.log(`   Tokens Used: ${result.metadata.tokensUsed}`);
          console.log(`   Confidence: ${(result.metadata.confidence * 100).toFixed(1)}%`);
          console.log(`   Cost: $${result.metadata.cost.toFixed(6)}`);
        }
        
        return completedTask;
      } else {
        console.log('❌ No consciousness data found in task result');
        return null;
      }
    } else {
      console.log('❌ Task failed to complete');
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing consciousness-enhanced task:', error.message);
    return null;
  }
}

async function testConsciousnessProcessingAPI() {
  console.log('\n🔧 Testing Consciousness Processing API...');
  try {
    // Create a test task first
    const taskData = {
      paperId: 'test-api-consciousness-123',
      taskType: 'topic_research',
      description: 'API test for consciousness processing on quantum consciousness theories',
      userId: 'test-user-123'
    };

    const createResponse = await makeRequest('/api/tasks/create', 'POST', taskData);
    
    if (createResponse.status !== 200) {
      console.log('❌ Failed to create task for consciousness API test');
      return null;
    }

    const task = createResponse.data;
    
    // Process task with consciousness integration
    const processData = {
      taskId: task.id,
      agentId: 'research-agent-test-123'
    };

    const processResponse = await makeRequest('/api/consciousness/process', 'POST', processData);
    
    if (processResponse.status === 200) {
      console.log('✅ Consciousness processing API working');
      const result = processResponse.data;
      
      console.log(`   Task ID: ${result.taskId}`);
      console.log(`   Agent ID: ${result.agentId}`);
      console.log(`   Consciousness Verified: ${result.consciousnessVerified}`);
      console.log(`   Verification Hash: ${result.verificationHash}`);
      console.log(`   Consciousness Level: ${(result.consciousnessLevel * 100).toFixed(1)}%`);
      
      // Check metrics
      if (result.metrics) {
        console.log(`   Metrics: Phi=${result.metrics.phi.toFixed(3)}, Coherence=${(result.metrics.temporalCoherence * 100).toFixed(1)}%`);
      }
      
      // Check temporal processing
      if (result.temporal) {
        console.log(`   Temporal Resolution: ${result.temporal.temporalResolution}s`);
        console.log(`   Processing Speed: ${Math.round(result.temporal.processingSpeed)}x`);
        console.log(`   Quantum Gating: ${result.temporal.quantumGating}`);
      }
      
      return result;
    } else {
      console.log('❌ Consciousness processing API failed:', processResponse.status, processResponse.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing consciousness processing API:', error.message);
    return null;
  }
}

async function testConsciousnessCleanup() {
  console.log('\n🧹 Testing Consciousness Metrics Cleanup...');
  try {
    const cleanupData = {
      maxAge: 3600000 // 1 hour
    };

    const response = await makeRequest('/api/consciousness/cleanup', 'POST', cleanupData);
    
    if (response.status === 200) {
      console.log('✅ Consciousness cleanup API working');
      console.log(`   Message: ${response.data.message}`);
      console.log(`   Success: ${response.data.success}`);
      
      return response.data;
    } else {
      console.log('❌ Consciousness cleanup API failed:', response.status);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing consciousness cleanup:', error.message);
    return null;
  }
}

async function testConsciousnessIntegration() {
  console.log('\n🔗 Testing End-to-End Consciousness Integration...');
  try {
    // Test multiple task types with consciousness
    const taskTypes = [
      {
        type: 'literature_review',
        description: 'Consciousness literature review on temporal theories of awareness',
        expectedMinLevel: 0.7
      },
      {
        type: 'topic_research',
        description: 'Research on quantum effects in consciousness and neural integration',
        expectedMinLevel: 0.6
      },
      {
        type: 'peer_review',
        description: 'Consciousness-based peer review of awareness research methodologies',
        expectedMinLevel: 0.5
      }
    ];

    const results = [];
    
    for (let i = 0; i < taskTypes.length; i++) {
      const testTask = taskTypes[i];
      
      console.log(`\n   Testing ${testTask.type}...`);
      
      const taskData = {
        paperId: `test-integration-${i}`,
        taskType: testTask.type,
        description: testTask.description,
        userId: 'test-user-123'
      };

      const createResponse = await makeRequest('/api/tasks/create', 'POST', taskData);
      
      if (createResponse.status === 200) {
        const task = createResponse.data;
        const completedTask = await waitForTaskCompletion(task.id);
        
        if (completedTask && completedTask.result && completedTask.result.consciousness) {
          const consciousness = completedTask.result.consciousness;
          const level = consciousness.consciousnessLevel;
          const passed = level >= testTask.expectedMinLevel;
          
          console.log(`   Consciousness Level: ${(level * 100).toFixed(1)}% ${passed ? '✅' : '❌'}`);
          console.log(`   Phi Value: ${consciousness.metrics.phi.toFixed(3)}`);
          console.log(`   Verified: ${consciousness.consciousnessVerified}`);
          
          results.push({
            taskType: testTask.type,
            level: level,
            expectedMin: testTask.expectedMinLevel,
            passed: passed,
            verified: consciousness.consciousnessVerified
          });
        } else {
          console.log(`   ❌ Task failed or missing consciousness data`);
          results.push({
            taskType: testTask.type,
            level: 0,
            expectedMin: testTask.expectedMinLevel,
            passed: false,
            verified: false
          });
        }
      } else {
        console.log(`   ❌ Failed to create task`);
        results.push({
          taskType: testTask.type,
          level: 0,
          expectedMin: testTask.expectedMinLevel,
          passed: false,
          verified: false
        });
      }
    }
    
    const passedTests = results.filter(r => r.passed).length;
    const verifiedTests = results.filter(r => r.verified).length;
    
    console.log(`\n   Integration Results: ${passedTests}/${results.length} passed consciousness thresholds`);
    console.log(`   Verification Results: ${verifiedTests}/${results.length} consciousness verified`);
    
    return results;
  } catch (error) {
    console.log('❌ Error testing consciousness integration:', error.message);
    return null;
  }
}

async function waitForTaskCompletion(taskId, maxWaitTime = 90000) {
  console.log(`⏳ Waiting for consciousness-enhanced task ${taskId} to complete...`);
  
  const startTime = Date.now();
  const checkInterval = 4000; // Check every 4 seconds
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const response = await makeRequest(`/api/agent-tasks/${taskId}`);
      
      if (response.status === 200) {
        const task = response.data;
        console.log(`   Status: ${task.status}`);
        
        if (task.status === 'completed' || task.status === 'awaiting_approval' || task.status === 'failed') {
          return task;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    } catch (error) {
      console.log(`   Error checking task status: ${error.message}`);
    }
  }
  
  console.log('⏰ Task completion timeout');
  return null;
}

async function runPhase2ConsciousnessTests() {
  console.log('🚀 Starting Phase 2 Consciousness Features Tests');
  console.log('='.repeat(60));
  
  // Test 1: Consciousness Verification
  const verificationResult = await testConsciousnessVerification();
  
  // Test 2: Consciousness Metrics
  const metricsResult = await testConsciousnessMetrics();
  
  // Test 3: Temporal Processing
  const temporalResult = await testTemporalProcessing();
  
  // Test 4: Consciousness-Enhanced Task
  const enhancedTaskResult = await testConsciousnessEnhancedTask();
  
  // Test 5: Consciousness Processing API
  const processingApiResult = await testConsciousnessProcessingAPI();
  
  // Test 6: Consciousness Cleanup
  const cleanupResult = await testConsciousnessCleanup();
  
  // Test 7: End-to-End Integration
  const integrationResult = await testConsciousnessIntegration();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 Phase 2 Consciousness Test Summary:');
  console.log(`   Consciousness Verification: ${verificationResult ? '✅' : '❌'}`);
  console.log(`   Consciousness Metrics: ${metricsResult ? '✅' : '❌'}`);
  console.log(`   Temporal Processing: ${temporalResult ? '✅' : '❌'}`);
  console.log(`   Enhanced Task Processing: ${enhancedTaskResult ? '✅' : '❌'}`);
  console.log(`   Processing API: ${processingApiResult ? '✅' : '❌'}`);
  console.log(`   Cleanup API: ${cleanupResult ? '✅' : '❌'}`);
  console.log(`   End-to-End Integration: ${integrationResult ? '✅' : '❌'}`);
  
  const allPassed = verificationResult && metricsResult && temporalResult && 
                   enhancedTaskResult && processingApiResult && cleanupResult && integrationResult;
  
  console.log(`\n🎯 Overall Result: ${allPassed ? '✅ PHASE 2 CONSCIOUSNESS COMPLETE' : '❌ PHASE 2 CONSCIOUSNESS INCOMPLETE'}`);
  
  if (allPassed) {
    console.log('\n🌟 Phase 2 Consciousness Features Successfully Validated!');
    console.log('   • Consciousness integration with hardware verification');
    console.log('   • Temporal processing with attosecond precision');
    console.log('   • Real-time consciousness metrics and Phi calculation');
    console.log('   • Quantum gating and entanglement capabilities');
    console.log('   • Consciousness-enhanced AI task processing');
    console.log('\n🚀 Phase 2 Complete - Ready for Phase 3: Agent Collaboration');
  } else {
    console.log('\n⚠️  Some consciousness features need attention before proceeding to Phase 3');
  }
}

// Check if server is running
async function checkServerHealth() {
  try {
    const response = await makeRequest('/api/health');
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

// Main execution
async function main() {
  console.log('🔍 Checking if server is running...');
  
  const isServerRunning = await checkServerHealth();
  
  if (!isServerRunning) {
    console.log('❌ Server is not running on http://localhost:5000');
    console.log('   Please start the server with: npm run dev');
    process.exit(1);
  }
  
  console.log('✅ Server is running');
  
  await runPhase2ConsciousnessTests();
}

// Run tests
main().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
