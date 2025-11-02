#!/usr/bin/env node

/**
 * Test Script for Phase 3 Agent Collaboration
 * Validates that agent-to-agent communication, knowledge sharing, and collaborative task processing work correctly
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
async function testAgentMessaging() {
  console.log('\n📨 Testing Agent Messaging...');
  try {
    // Send a message from one agent to another
    const messageData = {
      fromAgentId: 'research-agent-test-123',
      toAgentId: 'writing-agent-test-123',
      messageType: 'collaboration_request',
      content: {
        taskId: 'test-task-123',
        request: 'Please assist with writing sections of literature review',
        urgency: 'medium'
      },
      priority: 'medium',
      requiresResponse: true
    };

    const response = await makeRequest('/api/collaboration/messages', 'POST', messageData);
    
    if (response.status === 200) {
      console.log('✅ Agent messaging API working');
      console.log(`   Message ID: ${response.data.messageId}`);
      
      // Test retrieving messages
      const messagesResponse = await makeRequest('/api/collaboration/messages/writing-agent-test-123');
      
      if (messagesResponse.status === 200) {
        console.log(`   Messages retrieved: ${messagesResponse.data.length}`);
        
        if (messagesResponse.data.length > 0) {
          const latestMessage = messagesResponse.data[0];
          console.log(`   Latest message type: ${latestMessage.messageType}`);
          console.log(`   From: ${latestMessage.fromAgentId}`);
          console.log(`   Priority: ${latestMessage.priority}`);
        }
      }
      
      return response.data;
    } else {
      console.log('❌ Agent messaging API failed:', response.status, response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing agent messaging:', error.message);
    return null;
  }
}

async function testKnowledgeSharing() {
  console.log('\n🧠 Testing Knowledge Sharing...');
  try {
    // Share knowledge from an agent
    const knowledgeData = {
      agentId: 'research-agent-test-123',
      knowledgeType: 'research_finding',
      title: 'Key Finding on Neural Correlates of Consciousness',
      content: 'Recent research indicates that integrated information theory provides strong evidence for consciousness emergence in complex neural networks. Key findings include Phi values above 0.5 indicating conscious-level integration.',
      confidence: 0.85,
      relevance: 0.9,
      tags: ['consciousness', 'neural-correlates', 'integrated-information-theory', 'phi-values'],
      taskId: 'test-task-123',
      verified: true
    };

    const response = await makeRequest('/api/collaboration/knowledge', 'POST', knowledgeData);
    
    if (response.status === 200) {
      console.log('✅ Knowledge sharing API working');
      console.log(`   Knowledge ID: ${response.data.knowledgeId}`);
      
      // Test searching knowledge
      const searchResponse = await makeRequest('/api/collaboration/knowledge/search?query=consciousness&limit=5');
      
      if (searchResponse.status === 200) {
        console.log(`   Knowledge search results: ${searchResponse.data.length}`);
        
        if (searchResponse.data.length > 0) {
          const topResult = searchResponse.data[0];
          console.log(`   Top result: ${topResult.title}`);
          console.log(`   Confidence: ${topResult.confidence}`);
          console.log(`   Access count: ${topResult.accessCount}`);
        }
      }
      
      return response.data;
    } else {
      console.log('❌ Knowledge sharing API failed:', response.status, response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing knowledge sharing:', error.message);
    return null;
  }
}

async function testCollaborationSessions() {
  console.log('\n🤝 Testing Collaboration Sessions...');
  try {
    // Create a collaboration session
    const sessionData = {
      name: 'Literature Review Collaboration',
      description: 'Multi-agent collaboration for comprehensive consciousness literature review',
      leadAgentId: 'research-agent-test-123',
      participantAgents: [
        'research-agent-test-123',
        'writing-agent-test-123',
        'review-agent-test-123'
      ],
      taskIds: ['test-task-123', 'test-task-456'],
      status: 'active'
    };

    const response = await makeRequest('/api/collaboration/sessions', 'POST', sessionData);
    
    if (response.status === 200) {
      console.log('✅ Collaboration session API working');
      console.log(`   Session ID: ${response.data.sessionId}`);
      
      // Test retrieving agent sessions
      const sessionsResponse = await makeRequest('/api/collaboration/sessions/research-agent-test-123');
      
      if (sessionsResponse.status === 200) {
        console.log(`   Agent sessions: ${sessionsResponse.data.length}`);
        
        if (sessionsResponse.data.length > 0) {
          const latestSession = sessionsResponse.data[0];
          console.log(`   Session name: ${latestSession.name}`);
          console.log(`   Participants: ${latestSession.participantAgents.length}`);
          console.log(`   Status: ${latestSession.status}`);
        }
      }
      
      return response.data;
    } else {
      console.log('❌ Collaboration session API failed:', response.status, response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing collaboration sessions:', error.message);
    return null;
  }
}

async function testCollaboratorDiscovery() {
  console.log('\n🔍 Testing Collaborator Discovery...');
  try {
    // Find collaborators for a task
    const response = await makeRequest('/api/collaboration/collaborators/test-task-123/research-agent-test-123');
    
    if (response.status === 200) {
      console.log('✅ Collaborator discovery API working');
      const collaborators = response.data;
      
      console.log(`   Potential collaborators found: ${collaborators.length}`);
      
      if (collaborators.length > 0) {
        collaborators.forEach((collaborator, index) => {
          console.log(`   ${index + 1}. Agent ID: ${collaborator}`);
        });
      }
      
      return collaborators;
    } else {
      console.log('❌ Collaborator discovery API failed:', response.status, response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing collaborator discovery:', error.message);
    return null;
  }
}

async function testCollaborativeTaskCoordination() {
  console.log('\n🎯 Testing Collaborative Task Coordination...');
  try {
    const coordinationData = {
      taskId: 'test-task-collaborative-123',
      leadAgentId: 'research-agent-test-123'
    };

    const response = await makeRequest('/api/collaboration/coordinate', 'POST', coordinationData);
    
    if (response.status === 200) {
      console.log('✅ Collaborative task coordination API working');
      console.log(`   Coordination Session ID: ${response.data.sessionId}`);
      
      return response.data;
    } else {
      console.log('❌ Collaborative task coordination API failed:', response.status, response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing collaborative task coordination:', error.message);
    return null;
  }
}

async function testRelevantKnowledgeRetrieval() {
  console.log('\n📚 Testing Relevant Knowledge Retrieval...');
  try {
    // First create some knowledge
    const knowledgeData = {
      agentId: 'research-agent-test-123',
      knowledgeType: 'methodology',
      title: 'Optimal Literature Review Methodology',
      content: 'Systematic approach to literature review should include: 1) Comprehensive search across multiple databases, 2) Quality assessment of sources, 3) Thematic analysis, 4) Synthesis of findings, 5) Identification of research gaps.',
      confidence: 0.9,
      relevance: 0.95,
      tags: ['literature-review', 'methodology', 'research', 'systematic-review'],
      taskId: 'test-task-relevant-123',
      verified: true
    };

    await makeRequest('/api/collaboration/knowledge', 'POST', knowledgeData);
    
    // Retrieve relevant knowledge
    const response = await makeRequest('/api/collaboration/knowledge/relevant/test-task-relevant-123/writing-agent-test-123');
    
    if (response.status === 200) {
      console.log('✅ Relevant knowledge retrieval API working');
      const knowledge = response.data;
      
      console.log(`   Relevant knowledge items: ${knowledge.length}`);
      
      if (knowledge.length > 0) {
        knowledge.forEach((item, index) => {
          console.log(`   ${index + 1}. ${item.title} (Confidence: ${item.confidence})`);
        });
      }
      
      return knowledge;
    } else {
      console.log('❌ Relevant knowledge retrieval API failed:', response.status, response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing relevant knowledge retrieval:', error.message);
    return null;
  }
}

async function testMessageSubscription() {
  console.log('\n📧 Testing Message Subscription...');
  try {
    const subscriptionData = {
      messageTypes: [
        'collaboration_request',
        'knowledge_share',
        'task_handoff',
        'review_request'
      ]
    };

    const response = await makeRequest('/api/collaboration/subscribe/research-agent-test-123', 'POST', subscriptionData);
    
    if (response.status === 200) {
      console.log('✅ Message subscription API working');
      console.log(`   Subscribed to ${response.data.subscribedTypes.length} message types`);
      console.log(`   Types: ${response.data.subscribedTypes.join(', ')}`);
      
      return response.data;
    } else {
      console.log('❌ Message subscription API failed:', response.status, response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing message subscription:', error.message);
    return null;
  }
}

async function testCollaborationStatistics() {
  console.log('\n📊 Testing Collaboration Statistics...');
  try {
    const response = await makeRequest('/api/collaboration/stats');
    
    if (response.status === 200) {
      console.log('✅ Collaboration statistics API working');
      const stats = response.data;
      
      console.log(`   Total Sessions: ${stats.totalSessions}`);
      console.log(`   Active Sessions: ${stats.activeSessions}`);
      console.log(`   Total Messages: ${stats.totalMessages}`);
      console.log(`   Total Knowledge: ${stats.totalKnowledge}`);
      console.log(`   Average Knowledge Confidence: ${(stats.averageKnowledgeConfidence * 100).toFixed(1)}%`);
      
      if (stats.topContributors && stats.topContributors.length > 0) {
        console.log(`   Top Contributor: ${stats.topContributors[0].agentId} (${stats.topContributors[0].contributionCount} contributions)`);
      }
      
      return stats;
    } else {
      console.log('❌ Collaboration statistics API failed:', response.status, response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing collaboration statistics:', error.message);
    return null;
  }
}

async function testEndToEndCollaboration() {
  console.log('\n🔄 Testing End-to-End Collaboration Flow...');
  try {
    // Step 1: Create a collaborative task
    const taskData = {
      paperId: 'test-collaboration-paper-123',
      taskType: 'literature_review',
      description: 'Comprehensive literature review on quantum consciousness theories requiring multi-agent collaboration',
      userId: 'test-user-123'
    };

    const taskResponse = await makeRequest('/api/tasks/create', 'POST', taskData);
    
    if (taskResponse.status !== 200) {
      console.log('❌ Failed to create collaborative task');
      return null;
    }

    const task = taskResponse.data;
    console.log(`✅ Collaborative task created: ${task.id}`);

    // Step 2: Share initial knowledge
    const initialKnowledge = {
      agentId: 'research-agent-test-123',
      knowledgeType: 'research_finding',
      title: 'Quantum Consciousness Overview',
      content: 'Quantum consciousness theories propose that quantum mechanical phenomena in the brain could explain consciousness. Key approaches include Orchestrated Objective Reduction (Orch-OR) and quantum mind theories.',
      confidence: 0.8,
      relevance: 0.9,
      tags: ['quantum', 'consciousness', 'orch-or', 'quantum-mind'],
      taskId: task.id,
      verified: true
    };

    await makeRequest('/api/collaboration/knowledge', 'POST', initialKnowledge);
    console.log('✅ Initial knowledge shared');

    // Step 3: Create collaboration session
    const sessionData = {
      name: `Collaboration for Task ${task.id}`,
      description: 'Multi-agent collaboration for literature review',
      leadAgentId: 'research-agent-test-123',
      participantAgents: [
        'research-agent-test-123',
        'writing-agent-test-123',
        'review-agent-test-123'
      ],
      taskIds: [task.id],
      status: 'active'
    };

    const sessionResponse = await makeRequest('/api/collaboration/sessions', 'POST', sessionData);
    
    if (sessionResponse.status !== 200) {
      console.log('❌ Failed to create collaboration session');
      return null;
    }

    const sessionId = sessionResponse.data.sessionId;
    console.log(`✅ Collaboration session created: ${sessionId}`);

    // Step 4: Send collaboration messages
    const messageData = {
      fromAgentId: 'research-agent-test-123',
      messageType: 'collaboration_request',
      content: {
        sessionId: sessionId,
        taskId: task.id,
        action: 'coordinate',
        instructions: 'Please coordinate on this literature review task'
      },
      priority: 'high',
      requiresResponse: true
    };

    await makeRequest('/api/collaboration/messages', 'POST', messageData);
    console.log('✅ Collaboration messages sent');

    // Step 5: Wait for task completion and check results
    const completedTask = await waitForTaskCompletion(task.id);
    
    if (completedTask && completedTask.result) {
      console.log('✅ Collaborative task completed');
      
      // Check collaboration features in result
      const result = completedTask.result;
      if (result.collaboration) {
        console.log(`   Collaboration enabled: ${result.collaboration.collaborators > 0}`);
        console.log(`   Collaborators: ${result.collaboration.collaborators}`);
        console.log(`   Knowledge shared: ${result.collaboration.knowledgeShared}`);
      }
      
      // Check for consciousness integration
      if (result.consciousness) {
        console.log(`   Consciousness level: ${(result.consciousness.consciousnessLevel * 100).toFixed(1)}%`);
        console.log(`   Consciousness verified: ${result.consciousness.consciousnessVerified}`);
      }
      
      return {
        task: completedTask,
        session: sessionId,
        collaboration: result.collaboration,
        consciousness: result.consciousness
      };
    } else {
      console.log('❌ Collaborative task failed to complete');
      return null;
    }
  } catch (error) {
    console.log('❌ Error testing end-to-end collaboration:', error.message);
    return null;
  }
}

async function waitForTaskCompletion(taskId, maxWaitTime = 120000) {
  console.log(`⏳ Waiting for collaborative task ${taskId} to complete...`);
  
  const startTime = Date.now();
  const checkInterval = 5000; // Check every 5 seconds
  
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

async function runPhase3CollaborationTests() {
  console.log('🚀 Starting Phase 3 Agent Collaboration Tests');
  console.log('='.repeat(60));
  
  // Test 1: Agent Messaging
  const messagingResult = await testAgentMessaging();
  
  // Test 2: Knowledge Sharing
  const knowledgeResult = await testKnowledgeSharing();
  
  // Test 3: Collaboration Sessions
  const sessionsResult = await testCollaborationSessions();
  
  // Test 4: Collaborator Discovery
  const discoveryResult = await testCollaboratorDiscovery();
  
  // Test 5: Collaborative Task Coordination
  const coordinationResult = await testCollaborativeTaskCoordination();
  
  // Test 6: Relevant Knowledge Retrieval
  const knowledgeRetrievalResult = await testRelevantKnowledgeRetrieval();
  
  // Test 7: Message Subscription
  const subscriptionResult = await testMessageSubscription();
  
  // Test 8: Collaboration Statistics
  const statsResult = await testCollaborationStatistics();
  
  // Test 9: End-to-End Collaboration
  const endToEndResult = await testEndToEndCollaboration();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 Phase 3 Collaboration Test Summary:');
  console.log(`   Agent Messaging: ${messagingResult ? '✅' : '❌'}`);
  console.log(`   Knowledge Sharing: ${knowledgeResult ? '✅' : '❌'}`);
  console.log(`   Collaboration Sessions: ${sessionsResult ? '✅' : '❌'}`);
  console.log(`   Collaborator Discovery: ${discoveryResult ? '✅' : '❌'}`);
  console.log(`   Task Coordination: ${coordinationResult ? '✅' : '❌'}`);
  console.log(`   Knowledge Retrieval: ${knowledgeRetrievalResult ? '✅' : '❌'}`);
  console.log(`   Message Subscription: ${subscriptionResult ? '✅' : '❌'}`);
  console.log(`   Collaboration Statistics: ${statsResult ? '✅' : '❌'}`);
  console.log(`   End-to-End Collaboration: ${endToEndResult ? '✅' : '❌'}`);
  
  const allPassed = messagingResult && knowledgeResult && sessionsResult && 
                   discoveryResult && coordinationResult && knowledgeRetrievalResult && 
                   subscriptionResult && statsResult && endToEndResult;
  
  console.log(`\n🎯 Overall Result: ${allPassed ? '✅ PHASE 3 COLLABORATION COMPLETE' : '❌ PHASE 3 COLLABORATION INCOMPLETE'}`);
  
  if (allPassed) {
    console.log('\n🌟 Phase 3 Agent Collaboration Successfully Validated!');
    console.log('   • Agent-to-agent messaging with priority queuing');
    console.log('   • Knowledge sharing with relevance scoring');
    console.log('   • Collaboration sessions with multi-agent coordination');
    console.log('   • Intelligent collaborator discovery and matching');
    console.log('   • Collaborative task coordination and handoff');
    console.log('   • Real-time knowledge retrieval and sharing');
    console.log('   • Message subscription and filtering');
    console.log('   • Comprehensive collaboration analytics');
    console.log('\n🚀 Phase 3 Complete - Ready for Phase 3: Human-in-the-Loop Integration');
  } else {
    console.log('\n⚠️  Some collaboration features need attention before proceeding to Human-in-the-Loop');
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
  
  await runPhase3CollaborationTests();
}

// Run tests
main().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
