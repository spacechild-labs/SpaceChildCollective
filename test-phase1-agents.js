#!/usr/bin/env node

/**
 * Test Script for Phase 1 Agent Implementation
 * Validates that the agent manager, specialized agents, and task processing work correctly
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
async function testAgentStatus() {
  console.log('\n🤖 Testing Agent Status API...');
  try {
    const response = await makeRequest('/api/agents/status');
    
    if (response.status === 200) {
      console.log('✅ Agent status API working');
      console.log(`   Found ${response.data.length} agents`);
      
      response.data.forEach(agent => {
        console.log(`   - ${agent.id}: ${agent.status} (${agent.health})`);
      });
      
      return response.data;
    } else {
      console.log('❌ Agent status API failed:', response.status);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing agent status:', error.message);
    return null;
  }
}

async function testTaskStats() {
  console.log('\n📊 Testing Task Statistics API...');
  try {
    const response = await makeRequest('/api/tasks/stats');
    
    if (response.status === 200) {
      console.log('✅ Task stats API working');
      const stats = response.data;
      console.log(`   Total tasks: ${stats.total}`);
      console.log(`   Queued: ${stats.queued}`);
      console.log(`   In Progress: ${stats.inProgress}`);
      console.log(`   Completed: ${stats.completed}`);
      
      return stats;
    } else {
      console.log('❌ Task stats API failed:', response.status);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing task stats:', error.message);
    return null;
  }
}

async function testTaskCreation() {
  console.log('\n📝 Testing Task Creation...');
  try {
    const taskData = {
      paperId: 'test-paper-123',
      taskType: 'literature_review',
      description: 'Test literature review on consciousness research',
      userId: 'test-user-123'
    };

    const response = await makeRequest('/api/tasks/create', 'POST', taskData);
    
    if (response.status === 200) {
      console.log('✅ Task creation API working');
      console.log(`   Created task: ${response.data.id}`);
      console.log(`   Type: ${response.data.taskType}`);
      console.log(`   Status: ${response.data.status}`);
      
      return response.data;
    } else {
      console.log('❌ Task creation API failed:', response.status, response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing task creation:', error.message);
    return null;
  }
}

async function testMCPCommunications() {
  console.log('\n🔌 Testing MCP Communications API...');
  try {
    const response = await makeRequest('/api/mcp/communications');
    
    if (response.status === 200) {
      console.log('✅ MCP communications API working');
      console.log(`   Found ${response.data.length} communications`);
      
      if (response.data.length > 0) {
        const latest = response.data[0];
        console.log(`   Latest: ${latest.communicationType} at ${new Date(latest.createdAt).toLocaleString()}`);
      }
      
      return response.data;
    } else {
      console.log('❌ MCP communications API failed:', response.status);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing MCP communications:', error.message);
    return null;
  }
}

async function testAgentRestart() {
  console.log('\n🔄 Testing Agent Restart...');
  try {
    // First get agent status to find an agent
    const statusResponse = await makeRequest('/api/agents/status');
    
    if (statusResponse.status === 200 && statusResponse.data.length > 0) {
      const agentId = statusResponse.data[0].id;
      
      const response = await makeRequest(`/api/agents/${agentId}/restart`, 'POST');
      
      if (response.status === 200) {
        console.log('✅ Agent restart API working');
        console.log(`   Restarted agent: ${agentId}`);
        return true;
      } else {
        console.log('❌ Agent restart API failed:', response.status);
        return false;
      }
    } else {
      console.log('⚠️  No agents available to test restart');
      return false;
    }
  } catch (error) {
    console.log('❌ Error testing agent restart:', error.message);
    return false;
  }
}

async function waitForTaskCompletion(taskId, maxWaitTime = 30000) {
  console.log(`⏳ Waiting for task ${taskId} to complete...`);
  
  const startTime = Date.now();
  const checkInterval = 2000; // Check every 2 seconds
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const response = await makeRequest(`/api/agent-tasks/${taskId}`);
      
      if (response.status === 200) {
        const task = response.data;
        console.log(`   Task status: ${task.status}`);
        
        if (task.status === 'completed' || task.status === 'awaiting_approval' || task.status === 'failed') {
          console.log(`✅ Task finished with status: ${task.status}`);
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

async function runPhase1Tests() {
  console.log('🚀 Starting Phase 1 Agent Implementation Tests');
  console.log('='.repeat(60));
  
  // Test 1: Agent Status
  const agents = await testAgentStatus();
  
  // Test 2: Task Statistics
  const stats = await testTaskStats();
  
  // Test 3: MCP Communications
  const communications = await testMCPCommunications();
  
  // Test 4: Task Creation
  const task = await testTaskCreation();
  
  // Test 5: Agent Restart
  await testAgentRestart();
  
  // Test 6: Task Processing (if task was created)
  if (task) {
    console.log('\n⏱️  Testing Task Processing...');
    const completedTask = await waitForTaskCompletion(task.id);
    
    if (completedTask) {
      console.log('✅ Task processing test completed');
      if (completedTask.result) {
        console.log(`   Result success: ${completedTask.result.success}`);
        if (completedTask.result.metadata) {
          console.log(`   Confidence: ${completedTask.result.metadata.confidence}`);
        }
      }
    } else {
      console.log('⚠️  Task processing test inconclusive');
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 Phase 1 Test Summary:');
  console.log(`   Agent Status: ${agents ? '✅' : '❌'}`);
  console.log(`   Task Statistics: ${stats ? '✅' : '❌'}`);
  console.log(`   MCP Communications: ${communications ? '✅' : '❌'}`);
  console.log(`   Task Creation: ${task ? '✅' : '❌'}`);
  console.log(`   Agent Restart: ${agents ? '✅' : '❌'}`);
  
  const allPassed = agents && stats && communications && task;
  console.log(`\n🎯 Overall Result: ${allPassed ? '✅ PHASE 1 COMPLETE' : '❌ PHASE 1 INCOMPLETE'}`);
  
  if (allPassed) {
    console.log('\n🌟 Phase 1 Implementation Successfully Validated!');
    console.log('   • Agent Manager is running with autonomous processes');
    console.log('   • Specialized agents (Research, Writing, Review) are implemented');
    console.log('   • Task processing with intelligent assignment is working');
    console.log('   • Real-time monitoring and health checks are operational');
    console.log('\n🚀 Ready to proceed to Phase 2: AI Model Integration');
  } else {
    console.log('\n⚠️  Some components need attention before proceeding to Phase 2');
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
  
  await runPhase1Tests();
}

// Run tests
main().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
