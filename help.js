#!/usr/bin/env node

/**
 * Help script for contract-analyzer
 * 
 * This script provides a simple interface to show commonly used commands.
 */

console.log('\n🔍 contract-analyzer - A tool for analyzing Ethereum smart contracts\n');

console.log('✨ Setup & Start:');
console.log('  npm run setup                       Setup the tool and configure API keys');
console.log('  npm run dev                         Test with the default Ethereum contract (WETH)');
console.log('  npm run dev 0xContractAddress       Analyze a specific Ethereum contract');

console.log('\n🔎 Analyze Ethereum Contracts:');
console.log('  npm run analyze -- -a 0xAddress     Analyze a contract on Ethereum');
console.log('  npm run analyze -- -a 0xAddress -d  Force API key prompt (dev mode)');

console.log('\n🧩 Working with Additional EVM Chains (Optional):');
console.log('  npm run networks:list               List all configured networks');
console.log('  npm run networks:add                Add a new EVM-compatible network');
console.log('  npm run analyze -- -a 0xAddress -c chainname   Analyze on another chain');

console.log('\n📋 Examples:');
console.log('  # Analyze the USDC contract on Ethereum');
console.log('  npm run analyze -- -a 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
console.log('\n  # Add Polygon network and analyze a contract there');
console.log('  npm run networks:add');
console.log('  npm run analyze -- -a 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 -c polygon');

console.log('\n📚 For complete documentation:');
console.log('  node cli.js --help');
console.log('  node cli.js analyze --help');
console.log('  node cli.js networks --help');

console.log('\n⚙️  Adding New Networks:');
console.log('  To add a new EVM chain to your configuration, run:');
console.log('  npm run networks:add');
console.log('\n  You will need:');
console.log('  1. A network identifier (e.g., "polygon", "optimism")');
console.log('  2. An RPC URL (e.g., "https://polygon-rpc.com" or "https://provider.com/{key}")');
console.log('  3. A block explorer API URL (e.g., "https://api.polygonscan.com/api")');
console.log('  4. The name of the block explorer (e.g., "Polygonscan")');

console.log(); 