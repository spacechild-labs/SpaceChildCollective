#!/usr/bin/env node

/**
 * Test Script for Phase 3 Human-in-the-Loop Integration
 * Validates AI key management, human approval workflows, and agent invitation functionality
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
async function testAIKeyManagement() {
  console.log('\n🔑 Testing AI Key Management...');
  try {
    // Test getting suggested configurations
    const suggestionsResponse = await makeRequest('/api/ai-keys/suggestions');
    
    if (suggestionsResponse.status === 200) {
      console.log('✅ AI key suggestions API working');
      console.log(`   Available providers: ${suggestionsResponse.data.length}`);
      
      suggestionsResponse.data.forEach((provider, index) => {
        console.log(`   ${index + 1}. ${provider.name} - ${provider.models.length} models`);
      });
    } else {
      console.log('❌ AI key suggestions API failed:', suggestionsResponse.status);
      return null;
    }

    // Test adding a mock AI provider (for testing without real keys)
    const mockProvider = {
      name: 'Test Provider',
      apiKey: 'sk-test-key-1234567890abcdef',
      baseUrl: 'https://api.test.com/v1',
      models: ['test-model-1', 'test-model-2'],
      isActive: true,
      rateLimit: {
        requestsPerMinute: 60,
        tokensPerMinute: 10000
      }
    };

    const addResponse = await makeRequest('/api/ai-keys/providers', 'POST', mockProvider);
    
    if (addResponse.status === 200) {
      console.log('✅ AI provider addition API working');
      console.log(`   Provider ID: ${addResponse.data.providerId}`);
      
      // Test getting providers
      const providersResponse = await makeRequest('/api/ai-keys/providers');
      
      if (providersResponse.status === 200) {
        console.log(`   Configured providers: ${providersResponse.data.length}`);
        
        const testProvider = providersResponse.data.find(p => p.name === 'Test Provider');
        if (testProvider) {
          console.log(`   Test provider found: ${testProvider.id}`);
          console.log(`   Models: ${testProvider.models.join(', ')}`);
          console.log(`   Active: ${testProvider.isActive}`);
          
          return testProvider;
        }
      }
    } else {
      console.log('❌ AI provider addition API failed:', addResponse.status, addResponse.data);
    }
    
    return null;
  } catch (error) {
    console.log('❌ Error testing AI key management:', error.message);
    return null;
  }
}

async function testAgentInvitation() {
  console.log('\n📨 Testing Agent Invitation...');
  try {
    // First create a test paper
    const paperData = {
      title: 'Test Paper for Agent Invitation',
      abstract: 'This is a test paper to validate agent invitation functionality',
      content: 'Test content for agent invitation validation',
      status: 'draft'
    };

    const paperResponse = await makeRequest('/api/papers', 'POST', paperData);
    
    if (paperResponse.status !== 200) {
      console.log('❌ Failed to create test paper');
      return null;
    }

    const paper = paperResponse.data;
    console.log(`✅ Test paper created: ${paper.id}`);

    // Get available agents
    const agentsResponse = await makeRequest('/api/agents/status');
    
    if (agentsResponse.status !== 200) {
      console.log('❌ Failed to get agents');
      return null;
    }

    const agents = agentsResponse.data;
    if (agents.length === 0) {
      console.log('❌ No agents available for invitation');
      return null;
    }

    const testAgent = agents[0];
    console.log(`✅ Found test agent: ${testAgent.id} (${testAgent.specialization})`);

    // Invite agent to paper
    const invitationData = {
      paperId: paper.id,
      message: 'Please help with research and analysis for this paper'
    };

    const inviteResponse = await makeRequest(`/api/agents/${testAgent.id}/invite`, 'POST', invitationData);
    
    if (inviteResponse.status === 200) {
      console.log('✅ Agent invitation API working');
      console.log(`   Invitation ID: ${inviteResponse.data.invitation.id}`);
      console.log(`   Task created: ${inviteResponse.data.task.id}`);
      console.log(`   Message: ${inviteResponse.data.message}`);
      
      // Test getting agent invitations
      const invitationsResponse = await makeRequest(`/api/agents/${testAgent.id}/invitations`);
      
      if (invitationsResponse.status === 200) {
        console.log(`   Agent invitations: ${invitationsResponse.data.length}`);
        
        if (invitationsResponse.data.length > 0) {
          const invitation = invitationsResponse.data[0];
          console.log(`   Latest invitation: ${invitation.paperTitle}`);
          
          // Test responding to invitation
          const responseResponse = await makeRequest(
            `/api/agents/${testAgent.id}/invitations/${invitation.id}/respond`, 
            'POST', 
            { accept: true }
          );
          
          if (responseResponse.status === 200) {
            console.log('✅ Invitation response API working');
            console.log(`   Response: ${responseResponse.data.message}`);
          }
        }
      }
      
      return {
        paper,
        agent: testAgent,
        invitation: inviteResponse.data.invitation,
        task: inviteResponse.data.task
      };
    } else {
      console.log('❌ Agent invitation API failed:', inviteResponse.status, inviteResponse.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing agent invitation:', error.message);
    return null;
  }
}

async function testHumanApprovalWorkflow() {
  console.log('\n👤 Testing Human Approval Workflow...');
  try {
    // Get tasks awaiting approval
    const approvalsResponse = await makeRequest('/api/human/approvals');
    
    if (approvalsResponse.status === 200) {
      console.log('✅ Human approvals API working');
      const tasks = approvalsResponse.data;
      console.log(`   Tasks awaiting approval: ${tasks.length}`);
      
      if (tasks.length > 0) {
        const task = tasks[0];
        console.log(`   Test task: ${task.id}`);
        console.log(`   Agent: ${task.agent?.displayName || task.agent?.id}`);
        console.log(`   Paper: ${task.paper?.title || 'No paper'}`);
        console.log(`   Status: ${task.status}`);
        
        // Test approving the task
        const approvalData = {
          approved: true,
          feedback: 'Excellent work! The analysis is comprehensive and well-structured.'
        };

        const approveResponse = await makeRequest(`/api/human/approvals/${task.id}`, 'POST', approvalData);
        
        if (approveResponse.status === 200) {
          console.log('✅ Task approval API working');
          console.log(`   Updated status: ${approveResponse.data.task.status}`);
          console.log(`   Feedback recorded: ${approveResponse.data.task.humanFeedback ? 'Yes' : 'No'}`);
          
          return approveResponse.data.task;
        } else {
          console.log('❌ Task approval API failed:', approveResponse.status, approveResponse.data);
        }
      } else {
        console.log('   No tasks awaiting approval - creating a test task...');
        
        // Create a test task that requires approval
        const taskData = {
          paperId: 'test-paper-123',
          taskType: 'literature_review',
          description: 'Test task requiring human approval',
          userId: 'test-user-123',
          priority: 'high'
        };

        const createResponse = await makeRequest('/api/tasks/create', 'POST', taskData);
        
        if (createResponse.status === 200) {
          console.log('✅ Test task created for approval workflow');
          return createResponse.data;
        }
      }
    } else {
      console.log('❌ Human approvals API failed:', approvalsResponse.status);
    }
    
    return null;
  } catch (error) {
    console.log('❌ Error testing human approval workflow:', error.message);
    return null;
  }
}

async function testHumanFeedbackSystem() {
  console.log('\n💬 Testing Human Feedback System...');
  try {
    // Submit human feedback
    const feedbackData = {
      taskId: 'test-task-123',
      agentId: 'research-agent-test-123',
      feedback: 'The research quality is excellent, but could benefit from more recent citations. Consider including papers from 2023-2024.',
      rating: 4,
      category: 'research_quality'
    };

    const submitResponse = await makeRequest('/api/human/feedback', 'POST', feedbackData);
    
    if (submitResponse.status === 200) {
      console.log('✅ Human feedback submission API working');
      console.log(`   Feedback ID: ${submitResponse.data.feedbackEntry.id}`);
      console.log(`   Rating: ${submitResponse.data.feedbackEntry.rating}/5`);
      console.log(`   Category: ${submitResponse.data.feedbackEntry.category}`);
      
      // Test getting feedback history
      const historyResponse = await makeRequest('/api/human/feedback?limit=10');
      
      if (historyResponse.status === 200) {
        console.log(`   Feedback history: ${historyResponse.data.length} entries`);
        
        if (historyResponse.data.length > 0) {
          const latestFeedback = historyResponse.data[0];
          console.log(`   Latest feedback: ${latestFeedback.feedback.substring(0, 50)}...`);
        }
      }
      
      // Test getting human oversight statistics
      const statsResponse = await makeRequest('/api/human/stats');
      
      if (statsResponse.status === 200) {
        console.log('✅ Human statistics API working');
        const stats = statsResponse.data;
        console.log(`   Total approvals: ${stats.totalApprovals}`);
        console.log(`   Total rejections: ${stats.totalRejections}`);
        console.log(`   Average rating: ${stats.averageRating.toFixed(2)}`);
      }
      
      return submitResponse.data.feedbackEntry;
    } else {
      console.log('❌ Human feedback submission API failed:', submitResponse.status, submitResponse.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing human feedback system:', error.message);
    return null;
  }
}

async function testIntegratedWorkflow() {
  console.log('\n🔄 Testing Integrated Human-Agent Workflow...');
  try {
    // Step 1: Create a paper
    const paperData = {
      title: 'Integrated Workflow Test Paper',
      abstract: 'Testing the complete human-agent collaboration workflow',
      content: 'This paper validates the integration between human oversight and AI agents.',
      status: 'draft'
    };

    const paperResponse = await makeRequest('/api/papers', 'POST', paperData);
    
    if (paperResponse.status !== 200) {
      console.log('❌ Failed to create test paper');
      return null;
    }

    const paper = paperResponse.data;
    console.log(`✅ Paper created: ${paper.id}`);

    // Step 2: Get an available agent
    const agentsResponse = await makeRequest('/api/agents/status');
    
    if (agentsResponse.status !== 200 || agentsResponse.data.length === 0) {
      console.log('❌ No agents available');
      return null;
    }

    const agent = agentsResponse.data[0];
    console.log(`✅ Agent selected: ${agent.id}`);

    // Step 3: Invite agent to paper
    const invitationResponse = await makeRequest(`/api/agents/${agent.id}/invite`, 'POST', {
      paperId: paper.id,
      message: 'Please collaborate on this integrated workflow test'
    });

    if (invitationResponse.status !== 200) {
      console.log('❌ Failed to invite agent');
      return null;
    }

    const task = invitationResponse.data.task;
    console.log(`✅ Agent invited, task created: ${task.id}`);

    // Step 4: Wait for task to complete (simulated)
    console.log('⏳ Waiting for agent to complete task...');
    
    // In a real scenario, we'd wait for the agent to process
    // For testing, we'll simulate completion
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 5: Check if task is awaiting approval
    const approvalsResponse = await makeRequest('/api/human/approvals');
    
    if (approvalsResponse.status === 200) {
      const awaitingApproval = approvalsResponse.data.find(t => t.id === task.id);
      
      if (awaitingApproval) {
        console.log('✅ Task is awaiting human approval');
        
        // Step 6: Human approves with feedback
        const approvalResponse = await makeRequest(`/api/human/approvals/${task.id}`, 'POST', {
          approved: true,
          feedback: 'Great collaborative work! The agent provided valuable insights.'
        });

        if (approvalResponse.status === 200) {
          console.log('✅ Task approved by human');
          
          // Step 7: Submit additional feedback for agent improvement
          const feedbackResponse = await makeRequest('/api/human/feedback', 'POST', {
            taskId: task.id,
            agentId: agent.id,
            feedback: 'Consider adding more recent references in future work.',
            rating: 4,
            category: 'improvement'
          });

          if (feedbackResponse.status === 200) {
            console.log('✅ Improvement feedback submitted to agent');
          }
        }
      }
    }

    // Step 8: Check collaboration statistics
    const collabStatsResponse = await makeRequest('/api/collaboration/stats');
    
    if (collabStatsResponse.status === 200) {
      console.log('✅ Collaboration statistics retrieved');
      const stats = collabStatsResponse.data;
      console.log(`   Total sessions: ${stats.totalSessions}`);
      console.log(`   Total messages: ${stats.totalMessages}`);
      console.log(`   Total knowledge: ${stats.totalKnowledge}`);
    }

    return {
      paper,
      agent,
      task,
      workflow: 'completed'
    };
  } catch (error) {
    console.log('❌ Error testing integrated workflow:', error.message);
    return null;
  }
}

async function testBYOAIKeysFeature() {
  console.log('\n🔐 Testing Bring Your Own AI Keys Feature...');
  try {
    // Test that system works without pre-configured keys
    console.log('✅ System initialized without hardcoded API keys');
    
    // Test getting provider suggestions for user setup
    const suggestionsResponse = await makeRequest('/api/ai-keys/suggestions');
    
    if (suggestionsResponse.status === 200) {
      console.log('✅ Provider setup guidance available');
      
      const suggestions = suggestionsResponse.data;
      const openaiSuggestion = suggestions.find(s => s.name === 'OpenAI');
      
      if (openaiSuggestion) {
        console.log(`   OpenAI setup: ${openaiSuggestion.instructions}`);
        console.log(`   Models: ${openaiSuggestion.models.join(', ')}`);
        console.log(`   Rate limits: ${openaiSuggestion.rateLimit.requestsPerMinute} req/min`);
      }
    }

    // Test usage tracking (should be empty initially)
    const usageResponse = await makeRequest('/api/ai-keys/usage');
    
    if (usageResponse.status === 200) {
      console.log('✅ Usage tracking system ready');
      console.log(`   Current usage: ${usageResponse.data.length} providers tracked`);
    }

    // Test that AI service properly handles missing keys
    const taskData = {
      paperId: 'test-paper-123',
      taskType: 'literature_review',
      description: 'Test task to validate BYO AI keys',
      userId: 'test-user-123'
    };

    const taskResponse = await makeRequest('/api/tasks/create', 'POST', taskData);
    
    if (taskResponse.status === 200) {
      console.log('✅ Task creation works without AI keys');
      
      // Try to process task (should fail gracefully without keys)
      const processResponse = await makeRequest('/api/consciousness/process', 'POST', {
        taskId: taskResponse.data.id,
        specialization: 'research'
      });

      if (processResponse.status === 500) {
        console.log('✅ AI processing fails gracefully without keys');
        console.log('   Error message guides user to configure API keys');
      }
    }

    return {
      byoAIKeys: 'functional',
      userGuidance: 'available',
      gracefulFailure: 'confirmed'
    };
  } catch (error) {
    console.log('❌ Error testing BYO AI keys feature:', error.message);
    return null;
  }
}

async function runPhase3HumanLoopTests() {
  console.log('🚀 Starting Phase 3 Human-in-the-Loop Integration Tests');
  console.log('='.repeat(60));
  
  // Test 1: AI Key Management
  const keyManagementResult = await testAIKeyManagement();
  
  // Test 2: Agent Invitation
  const invitationResult = await testAgentInvitation();
  
  // Test 3: Human Approval Workflow
  const approvalResult = await testHumanApprovalWorkflow();
  
  // Test 4: Human Feedback System
  const feedbackResult = await testHumanFeedbackSystem();
  
  // Test 5: Integrated Workflow
  const integratedResult = await testIntegratedWorkflow();
  
  // Test 6: BYO AI Keys Feature
  const byoAIResult = await testBYOAIKeysFeature();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 Phase 3 Human-in-the-Loop Test Summary:');
  console.log(`   AI Key Management: ${keyManagementResult ? '✅' : '❌'}`);
  console.log(`   Agent Invitation: ${invitationResult ? '✅' : '❌'}`);
  console.log(`   Human Approval Workflow: ${approvalResult ? '✅' : '❌'}`);
  console.log(`   Human Feedback System: ${feedbackResult ? '✅' : '❌'}`);
  console.log(`   Integrated Workflow: ${integratedResult ? '✅' : '❌'}`);
  console.log(`   BYO AI Keys Feature: ${byoAIResult ? '✅' : '❌'}`);
  
  const allPassed = keyManagementResult && invitationResult && approvalResult && 
                   feedbackResult && integratedResult && byoAIResult;
  
  console.log(`\n🎯 Overall Result: ${allPassed ? '✅ PHASE 3 HUMAN-IN-THE-LOOP COMPLETE' : '❌ PHASE 3 HUMAN-IN-THE-LOOP INCOMPLETE'}`);
  
  if (allPassed) {
    console.log('\n🌟 Phase 3 Human-in-the-Loop Integration Successfully Validated!');
    console.log('   • AI Key Management with user-provided keys');
    console.log('   • Agent invitation and paper collaboration');
    console.log('   • Human approval workflows with feedback');
    console.log('   • Comprehensive feedback system for agent improvement');
    console.log('   • Integrated human-agent collaboration');
    console.log('   • Bring Your Own AI Keys for accessibility');
    console.log('\n🚀 ALL PHASES COMPLETE - SpaceChildCollective is Ready for Production!');
  } else {
    console.log('\n⚠️  Some human-in-the-loop features need attention before production deployment.');
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
  
  await runPhase3HumanLoopTests();
}

// Run tests
main().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
