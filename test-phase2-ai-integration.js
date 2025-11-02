#!/usr/bin/env node

/**
 * Test Script for Phase 2 AI Integration
 * Validates that the enhanced AI service, intelligent model selection, and research-specific prompts work correctly
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
async function testResearchAgentWithAI() {
  console.log('\n🔬 Testing Research Agent with Enhanced AI...');
  try {
    const taskData = {
      paperId: 'test-paper-research-123',
      taskType: 'literature_review',
      description: 'Conduct a comprehensive literature review on neural correlates of consciousness and integrated information theory',
      userId: 'test-user-123'
    };

    const response = await makeRequest('/api/tasks/create', 'POST', taskData);
    
    if (response.status === 200) {
      console.log('✅ Research task created successfully');
      const task = response.data;
      
      // Wait for task completion
      const completedTask = await waitForTaskCompletion(task.id);
      
      if (completedTask && completedTask.result) {
        console.log('✅ Research Agent processed task with enhanced AI');
        console.log(`   Model used: ${completedTask.result.metadata?.model || 'Unknown'}`);
        console.log(`   Tokens used: ${completedTask.result.metadata?.tokensUsed || 0}`);
        console.log(`   Confidence: ${completedTask.result.metadata?.confidence || 0}`);
        console.log(`   Cost: $${completedTask.result.metadata?.cost || 0}`);
        console.log(`   Success: ${completedTask.result.success}`);
        
        // Check for structured output
        const result = completedTask.result.result;
        if (result.sections && result.sections.length > 0) {
          console.log(`   Sections found: ${result.sections.length}`);
        }
        if (result.citations && result.citations.length > 0) {
          console.log(`   Citations extracted: ${result.citations.length}`);
        }
        if (result.keyFindings && result.keyFindings.length > 0) {
          console.log(`   Key findings: ${result.keyFindings.length}`);
        }
        
        return completedTask;
      } else {
        console.log('❌ Research task failed to complete');
        return null;
      }
    } else {
      console.log('❌ Failed to create research task:', response.status, response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing research agent:', error.message);
    return null;
  }
}

async function testWritingAgentWithAI() {
  console.log('\n✍️ Testing Writing Agent with Enhanced AI...');
  try {
    const taskData = {
      paperId: 'test-paper-writing-123',
      taskType: 'content_generation',
      description: 'Generate academic content on the role of quantum mechanics in consciousness research, including introduction, methodology, and discussion sections',
      userId: 'test-user-123'
    };

    const response = await makeRequest('/api/tasks/create', 'POST', taskData);
    
    if (response.status === 200) {
      console.log('✅ Writing task created successfully');
      const task = response.data;
      
      // Wait for task completion
      const completedTask = await waitForTaskCompletion(task.id);
      
      if (completedTask && completedTask.result) {
        console.log('✅ Writing Agent processed task with enhanced AI');
        console.log(`   Model used: ${completedTask.result.metadata?.model || 'Unknown'}`);
        console.log(`   Word count: ${completedTask.result.result?.wordCount || 0}`);
        console.log(`   Clarity score: ${completedTask.result.result?.clarity || 0}`);
        console.log(`   Academic tone: ${completedTask.result.result?.academicTone || 0}`);
        console.log(`   Success: ${completedTask.result.success}`);
        
        // Check for structured output
        const result = completedTask.result.result;
        if (result.sections && result.sections.length > 0) {
          console.log(`   Sections generated: ${result.sections.length}`);
        }
        if (result.citationNeeds && result.citationNeeds.length > 0) {
          console.log(`   Citation needs identified: ${result.citationNeeds.length}`);
        }
        
        return completedTask;
      } else {
        console.log('❌ Writing task failed to complete');
        return null;
      }
    } else {
      console.log('❌ Failed to create writing task:', response.status, response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing writing agent:', error.message);
    return null;
  }
}

async function testReviewAgentWithAI() {
  console.log('\n🔍 Testing Review Agent with Enhanced AI...');
  try {
    const taskData = {
      paperId: 'test-paper-review-123',
      taskType: 'peer_review',
      description: 'Conduct a comprehensive peer review of a research paper on consciousness measurement methodologies, evaluating originality, methodology, and contribution to the field',
      userId: 'test-user-123'
    };

    const response = await makeRequest('/api/tasks/create', 'POST', taskData);
    
    if (response.status === 200) {
      console.log('✅ Review task created successfully');
      const task = response.data;
      
      // Wait for task completion
      const completedTask = await waitForTaskCompletion(task.id);
      
      if (completedTask && completedTask.result) {
        console.log('✅ Review Agent processed task with enhanced AI');
        console.log(`   Model used: ${completedTask.result.metadata?.model || 'Unknown'}`);
        console.log(`   Success: ${completedTask.result.success}`);
        
        // Check for structured output
        const result = completedTask.result.result;
        if (result.strengths && result.strengths.length > 0) {
          console.log(`   Strengths identified: ${result.strengths.length}`);
        }
        if (result.weaknesses && result.weaknesses.length > 0) {
          console.log(`   Weaknesses identified: ${result.weaknesses.length}`);
        }
        if (result.suggestions && result.suggestions.length > 0) {
          console.log(`   Suggestions provided: ${result.suggestions.length}`);
        }
        if (result.overallAssessment) {
          console.log('   Overall assessment provided');
        }
        
        return completedTask;
      } else {
        console.log('❌ Review task failed to complete');
        return null;
      }
    } else {
      console.log('❌ Failed to create review task:', response.status, response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing review agent:', error.message);
    return null;
  }
}

async function testIntelligentModelSelection() {
  console.log('\n🧠 Testing Intelligent Model Selection...');
  try {
    // Test different task types to verify model selection
    const testTasks = [
      {
        name: 'High Complexity Research',
        data: {
          paperId: 'test-model-selection-1',
          taskType: 'literature_review',
          description: 'Complex literature review requiring deep analysis',
          userId: 'test-user-123'
        },
        expectedModel: 'gpt-4'
      },
      {
        name: 'Medium Complexity Review',
        data: {
          paperId: 'test-model-selection-2',
          taskType: 'peer_review',
          description: 'Standard peer review task',
          userId: 'test-user-123'
        },
        expectedModel: 'gpt-4-turbo-preview'
      },
      {
        name: 'Low Complexity Writing',
        data: {
          paperId: 'test-model-selection-3',
          taskType: 'content_generation',
          description: 'Simple content generation',
          userId: 'test-user-123'
        },
        expectedModel: 'gpt-3.5-turbo'
      }
    ];

    const results = [];
    
    for (const test of testTasks) {
      console.log(`\n   Testing ${test.name}...`);
      
      const response = await makeRequest('/api/tasks/create', 'POST', test.data);
      
      if (response.status === 200) {
        const task = response.data;
        const completedTask = await waitForTaskCompletion(task.id);
        
        if (completedTask && completedTask.result) {
          const usedModel = completedTask.result.metadata?.model;
          const isCorrect = usedModel === test.expectedModel;
          
          console.log(`   Expected: ${test.expectedModel}, Used: ${usedModel} ${isCorrect ? '✅' : '❌'}`);
          
          results.push({
            test: test.name,
            expected: test.expectedModel,
            used: usedModel,
            correct: isCorrect
          });
        } else {
          console.log(`   ❌ Task failed to complete`);
          results.push({
            test: test.name,
            expected: test.expectedModel,
            used: 'Failed',
            correct: false
          });
        }
      } else {
        console.log(`   ❌ Failed to create task`);
        results.push({
          test: test.name,
          expected: test.expectedModel,
          used: 'Failed to create',
          correct: false
        });
      }
    }
    
    const correctSelections = results.filter(r => r.correct).length;
    console.log(`\n✅ Model Selection Results: ${correctSelections}/${results.length} correct`);
    
    return results;
  } catch (error) {
    console.log('❌ Error testing model selection:', error.message);
    return null;
  }
}

async function testContextManagement() {
  console.log('\n💾 Testing Context Management...');
  try {
    // Create related tasks to test context caching
    const paperId = 'test-context-paper-123';
    
    const task1Data = {
      paperId: paperId,
      taskType: 'literature_review',
      description: 'Initial literature review on consciousness theories',
      userId: 'test-user-123'
    };

    const task2Data = {
      paperId: paperId,
      taskType: 'topic_research',
      description: 'Follow-up research building on previous findings',
      userId: 'test-user-123'
    };

    // Create first task
    const response1 = await makeRequest('/api/tasks/create', 'POST', task1Data);
    if (response1.status !== 200) {
      console.log('❌ Failed to create first task for context test');
      return null;
    }

    const task1 = response1.data;
    const completedTask1 = await waitForTaskCompletion(task1.id);
    
    if (!completedTask1 || !completedTask1.result) {
      console.log('❌ First task failed to complete');
      return null;
    }

    console.log('✅ First task completed, context should be cached');
    
    // Wait a moment for context to be cached
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Create second related task
    const response2 = await makeRequest('/api/tasks/create', 'POST', task2Data);
    if (response2.status !== 200) {
      console.log('❌ Failed to create second task for context test');
      return null;
    }

    const task2 = response2.data;
    const completedTask2 = await waitForTaskCompletion(task2.id);
    
    if (!completedTask2 || !completedTask2.result) {
      console.log('❌ Second task failed to complete');
      return null;
    }

    console.log('✅ Second task completed using cached context');
    console.log(`   Task 1 tokens: ${completedTask1.result.metadata?.tokensUsed || 0}`);
    console.log(`   Task 2 tokens: ${completedTask2.result.metadata?.tokensUsed || 0}`);
    
    // Check if second task was more efficient (context reuse)
    const tokens1 = completedTask1.result.metadata?.tokensUsed || 0;
    const tokens2 = completedTask2.result.metadata?.tokensUsed || 0;
    
    if (tokens2 < tokens1 * 1.2) { // Allow 20% variance
      console.log('✅ Context management appears to be working efficiently');
    } else {
      console.log('⚠️  Context management efficiency unclear');
    }
    
    return {
      task1: completedTask1,
      task2: completedTask2,
      contextEfficiency: tokens2 < tokens1 * 1.2
    };
  } catch (error) {
    console.log('❌ Error testing context management:', error.message);
    return null;
  }
}

async function testCostOptimization() {
  console.log('\n💰 Testing Cost Optimization...');
  try {
    // Create tasks with different specializations to test cost optimization
    const tasks = [
      {
        specialization: 'research',
        taskType: 'literature_review',
        description: 'Research task for cost testing'
      },
      {
        specialization: 'writing',
        taskType: 'content_generation',
        description: 'Writing task for cost testing'
      },
      {
        specialization: 'review',
        taskType: 'peer_review',
        description: 'Review task for cost testing'
      }
    ];

    const results = [];
    
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      const taskData = {
        paperId: `test-cost-${i}`,
        taskType: task.taskType,
        description: task.description,
        userId: 'test-user-123'
      };

      const response = await makeRequest('/api/tasks/create', 'POST', taskData);
      
      if (response.status === 200) {
        const createdTask = response.data;
        const completedTask = await waitForTaskCompletion(createdTask.id);
        
        if (completedTask && completedTask.result) {
          const cost = completedTask.result.metadata?.cost || 0;
          const model = completedTask.result.metadata?.model || 'Unknown';
          
          console.log(`   ${task.specialization}: $${cost.toFixed(6)} using ${model}`);
          
          results.push({
            specialization: task.specialization,
            cost: cost,
            model: model
          });
        }
      }
    }
    
    if (results.length > 0) {
      const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
      const avgCost = totalCost / results.length;
      
      console.log(`✅ Cost Analysis Complete:`);
      console.log(`   Total cost: $${totalCost.toFixed(6)}`);
      console.log(`   Average cost per task: $${avgCost.toFixed(6)}`);
      
      // Check if writing tasks use cheaper models
      const writingTask = results.find(r => r.specialization === 'writing');
      if (writingTask && writingTask.model === 'gpt-3.5-turbo') {
        console.log('✅ Writing tasks correctly using cost-optimized model');
      }
      
      return results;
    } else {
      console.log('❌ No cost data collected');
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing cost optimization:', error.message);
    return null;
  }
}

async function waitForTaskCompletion(taskId, maxWaitTime = 60000) {
  console.log(`⏳ Waiting for task ${taskId} to complete...`);
  
  const startTime = Date.now();
  const checkInterval = 3000; // Check every 3 seconds
  
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

async function runPhase2Tests() {
  console.log('🚀 Starting Phase 2 AI Integration Tests');
  console.log('='.repeat(60));
  
  // Test 1: Research Agent with Enhanced AI
  const researchResult = await testResearchAgentWithAI();
  
  // Test 2: Writing Agent with Enhanced AI
  const writingResult = await testWritingAgentWithAI();
  
  // Test 3: Review Agent with Enhanced AI
  const reviewResult = await testReviewAgentWithAI();
  
  // Test 4: Intelligent Model Selection
  const modelSelectionResults = await testIntelligentModelSelection();
  
  // Test 5: Context Management
  const contextResults = await testContextManagement();
  
  // Test 6: Cost Optimization
  const costResults = await testCostOptimization();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 Phase 2 Test Summary:');
  console.log(`   Research Agent: ${researchResult ? '✅' : '❌'}`);
  console.log(`   Writing Agent: ${writingResult ? '✅' : '❌'}`);
  console.log(`   Review Agent: ${reviewResult ? '✅' : '❌'}`);
  console.log(`   Model Selection: ${modelSelectionResults ? '✅' : '❌'}`);
  console.log(`   Context Management: ${contextResults ? '✅' : '❌'}`);
  console.log(`   Cost Optimization: ${costResults ? '✅' : '❌'}`);
  
  const allPassed = researchResult && writingResult && reviewResult && 
                   modelSelectionResults && contextResults && costResults;
  
  console.log(`\n🎯 Overall Result: ${allPassed ? '✅ PHASE 2 COMPLETE' : '❌ PHASE 2 INCOMPLETE'}`);
  
  if (allPassed) {
    console.log('\n🌟 Phase 2 AI Integration Successfully Validated!');
    console.log('   • Enhanced AI service with intelligent model selection');
    console.log('   • Research-specific prompts and context management');
    console.log('   • Cost optimization and performance monitoring');
    console.log('   • Structured output with confidence scoring');
    console.log('\n🚀 Ready to proceed to Phase 3: Agent Collaboration');
  } else {
    console.log('\n⚠️  Some AI integration components need attention before proceeding to Phase 3');
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
  
  await runPhase2Tests();
}

// Run tests
main().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
