/**
 * MCP Server Simulator
 * This script simulates the behavior of an MCP server for demonstration purposes.
 */

console.log('MCP Server starting up...');

// Simulate initialization sequence
setTimeout(() => {
  console.log('Initializing MCP components...');
}, 1000);

setTimeout(() => {
  console.log('Loading configuration...');
}, 2000);

setTimeout(() => {
  console.log('MCP Server started successfully');
  console.log('Listening for connections...');
}, 3000);

// Simulate periodic activity
let counter = 0;
const interval = setInterval(() => {
  counter++;
  console.log(`MCP Server heartbeat #${counter}`);
  
  // Occasionally log additional information
  if (counter % 5 === 0) {
    console.log('Memory usage: nominal');
    console.log('Active connections: 0');
  }
  
  // Terminate after a certain number of heartbeats if needed
  if (counter >= 100) {
    clearInterval(interval);
    console.log('MCP Server shutting down normally...');
    process.exit(0);
  }
}, 5000);

// Handle process termination
process.on('SIGINT', () => {
  clearInterval(interval);
  console.log('MCP Server received shutdown signal');
  console.log('Closing connections...');
  console.log('MCP Server shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  clearInterval(interval);
  console.log('MCP Server received termination signal');
  console.log('Performing emergency shutdown...');
  process.exit(0);
}); 