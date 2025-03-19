#!/usr/bin/env node

import { getDeploymentBlock } from './startBlock.js';
import * as dotenv from 'dotenv';
import { getChain } from './chains.js';

// Load environment variables
dotenv.config();

const runTest = async () => {
  // Get chain from env or default to ethereum
  const selectedChain = process.env.SELECTED_CHAIN || 'ethereum';
  
  // Get chain configuration
  const network = await getChain(selectedChain);
  if (!network) {
    console.error(`Error: Chain configuration not found for '${selectedChain}'`);
    console.error(`Run 'cana chains list' to see available chains.`);
    process.exit(1);
  }
  
  // Get API keys and RPC URL
  const rpcUrl = process.env.RPC_URL || network.rpcFormat;
  const contractAddress = process.argv[2] || "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH as default
  
  // Try to get chain-specific API key first, fall back to ETHERSCAN_API_KEY
  const explorerKeyEnvName = `${selectedChain.toUpperCase()}_EXPLORER_KEY`;
  const explorerApiKey = process.env[explorerKeyEnvName] || process.env.ETHERSCAN_API_KEY;
  const blockExplorerUrl = network.blockExplorer;

  // Check if API key is set
  if (!explorerApiKey) {
    console.error(`Error: Block explorer API key is required for ${network.blockExplorerName}`);
    console.error(`Set ${explorerKeyEnvName} environment variable`);
    process.exit(1);
  }

  console.log(`Testing with contract: ${contractAddress}`);
  console.log(`Chain: ${network.name}`);
  console.log(`Using RPC URL: ${rpcUrl}`);
  console.log(`Using block explorer: ${blockExplorerUrl}`);
  console.log('Starting contract analysis...');

  getDeploymentBlock(rpcUrl, contractAddress, explorerApiKey, 10000, blockExplorerUrl)
    .then(result => {
      if (!result) {
        console.error('Failed to analyze contract');
        process.exit(1);
      }

      console.log('\nAnalysis complete!');
      console.log('\nSummary:');
      console.log(`Deployment Block: ${result.deploymentBlock}`);
      console.log(`Contract Verified: ${result.contractInfo?.isVerified ? 'Yes' : 'No'}`);

      console.log('\nProxy Information:');
      console.log(`Is Proxy: ${result.contractInfo?.proxy ? 'Yes' : 'No'}`);
      if (result.contractInfo?.proxy) {
        console.log(`Implementation: ${result.contractInfo.implementation}`);
      }

      if (result.contractInfo?.eventSignatures) {
        console.log('\nEvent Signatures:');
        result.contractInfo.eventSignatures.forEach(event => {
          console.log(`- ${event.name}: ${event.signature} (${event.signatureHash})`);
          event.inputs.forEach(input => {
            console.log(`  • ${input.name}: ${input.type} ${input.indexed ? '(indexed)' : ''}`);
          });
        });
      }

      const outputDir = result.outputDir || 'contract-info';
      console.log(`\nResults have been saved to the ${outputDir} directory.`);
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
};

// Run the test
runTest(); 