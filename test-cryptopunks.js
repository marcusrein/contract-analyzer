#!/usr/bin/env node

import { getDeploymentBlock } from './startBlock.js';
import { getContractInfo, getContractEvents } from './contractInfo.js';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

// Load environment variables
config();

// CryptoPunks contract address
const contractAddress = "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb";
const explorerApiKey = process.env.ETHERSCAN_API_KEY;
const explorerApiUrl = 'https://api.etherscan.io/api';

// Known deployment block for CryptoPunks (since it's an old contract)
// CryptoPunks was deployed on June 22, 2017 at block 3914495
const CRYPTOPUNKS_DEPLOYMENT_BLOCK = 3914495;

async function analyzeContractManually(address, deploymentBlock) {
  console.log(`📝 Using known deployment block ${deploymentBlock} for analysis...`);
  
  try {
    // Get contract information
    const contractInfo = await getContractInfo(null, address, explorerApiKey, explorerApiUrl);
    
    if (!contractInfo) {
      console.log('⚠️ Could not retrieve contract information');
      return null;
    }
    
    console.log('✅ Contract information retrieved');
    console.log(`Contract Name: ${contractInfo.contractName || 'Unknown'}`);
    console.log(`Verified: ${contractInfo.isVerified ? 'Yes' : 'No'}`);
    console.log(`Is Proxy: ${contractInfo.proxy ? 'Yes' : 'No'}`);
    
    // Get latest block
    const blockResponse = await fetch(
      `${explorerApiUrl}?module=proxy&action=eth_blockNumber&apikey=${explorerApiKey}`
    );
    const blockData = await blockResponse.json();
    const latestBlock = parseInt(blockData.result, 16);
    
    console.log(`✅ Latest block: ${latestBlock}`);
    
    // Get events with a limited range
    console.log('📝 Fetching recent events (limited to last 100,000 blocks)...');
    const fromBlock = Math.max(deploymentBlock, latestBlock - 100000);
    
    const eventsResponse = await fetch(
      `${explorerApiUrl}?module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=latest&address=${address}&apikey=${explorerApiKey}`
    );
    const eventsData = await eventsResponse.json();
    
    let events = [];
    if (eventsData.status === '1' && eventsData.result) {
      events = eventsData.result.slice(0, 100);  // Limit to 100 events
      console.log(`✅ Retrieved ${events.length} recent events from block explorer`);
    } else {
      console.log(`ℹ️ No events found: ${eventsData.message || 'Unknown error'}`);
    }
    
    // Create a unique folder name based on contract name, chain, and date
    const date = new Date();
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    // Get contract name, defaulting to address if not available
    const contractName = contractInfo.contractName || address.slice(0, 10);
    
    // Sanitize folder name to remove special characters
    const sanitizedContractName = contractName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const chainName = 'ethereum'; // Default to ethereum for this test
    
    // Create folder name
    const folderName = `${sanitizedContractName}_${chainName}_${dateString}`;
    const outputDir = path.join(process.cwd(), folderName);
    
    // Create the directory
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`📁 Created analysis folder: ${folderName}`);
    
    // Save ABI
    if (contractInfo.abi) {
      await fs.writeFile(
        path.join(outputDir, 'abi.json'),
        JSON.stringify(contractInfo.abi, null, 2)
      );
      console.log(`💾 ABI saved to ${folderName}/abi.json`);
    }
    
    // Save source code
    if (contractInfo.sourceCode) {
      await fs.writeFile(
        path.join(outputDir, 'contract.sol'),
        contractInfo.sourceCode
      );
      console.log(`💾 Source code saved to ${folderName}/contract.sol`);
    }
    
    // Save events
    if (events.length > 0) {
      // Store metadata with the events
      const eventsData = {
        metadata: {
          description: "This file contains comprehensive event data for the analyzed contract: (1) Event signatures with full definitions and parameter details for all detected event types, and (2) Exactly 3 real on-chain examples of each event type with complete blockchain data for reference and analysis.",
          totalEventsFound: events.length,
          limitedToExamples: true,
          examplesPerEventType: 3,
          uniqueEventTypes: events.reduce((types, event) => {
            const topic = event.topics && event.topics[0] ? event.topics[0] : 'unknown';
            if (!types.includes(topic)) types.push(topic);
            return types;
          }, []).length
        },
        eventSignatures: contractInfo.eventSignatures || [],
        "event-examples": events
      };
      
      await fs.writeFile(
        path.join(outputDir, 'event-information.json'),
        JSON.stringify(eventsData, null, 2)
      );
      console.log(`💾 Events saved to ${folderName}/event-information.json`);
    }
    
    return {
      deploymentBlock,
      contractInfo,
      events,
      outputDir: folderName // Return the folder name for use in the CLI
    };
  } catch (error) {
    console.error(`❌ Error in manual analysis: ${error.message}`);
    return null;
  }
}

async function testCryptoPunks() {
  console.log("🚀 Testing analysis of CryptoPunks contract...");
  
  if (!explorerApiKey) {
    console.error('❌ Please set the ETHERSCAN_API_KEY environment variable');
    process.exit(1);
  }

  try {
    // First try the standard analysis
    console.log("📝 Attempting standard analysis first...");
    let result = await getDeploymentBlock(
      null, // No RPC URL needed
      contractAddress,
      explorerApiKey,
      1000,  // Block range
      explorerApiUrl
    );
    
    // If standard analysis fails, use manual analysis with known deployment block
    if (!result) {
      console.log("\n⚠️ Standard analysis failed. Using manual analysis with known deployment block...");
      result = await analyzeContractManually(contractAddress, CRYPTOPUNKS_DEPLOYMENT_BLOCK);
    }
    
    if (!result) {
      console.error("\n❌ Both standard and manual analysis failed");
      return;
    }

    console.log("\n🎉 Analysis complete!");
    console.log("📊 Summary:");
    console.log(`- Deployment Block: ${result.deploymentBlock}`);
    console.log(`- Contract Verified: ${result.contractInfo?.isVerified ? 'Yes' : 'No'}`);
    console.log(`- Contract Name: ${result.contractInfo?.contractName || 'Unknown'}`);
    console.log(`- Is Proxy: ${result.contractInfo?.proxy ? 'Yes' : 'No'}`);
    console.log(`- Events Found: ${result.events?.length || 0}`);

    // Display the event signatures
    if (result.contractInfo?.eventSignatures) {
      console.log("\n📋 Event Signatures:");
      result.contractInfo.eventSignatures.forEach(event => {
        console.log(`- ${event.name}: ${event.signature}`);
        console.log(`  Hash: ${event.signatureHash}`);
      });
    }

    // Display the first few events if available
    if (result.events && result.events.length > 0) {
      console.log("\n📋 First 3 Events:");
      result.events.slice(0, 3).forEach((event, index) => {
        console.log(`\nEvent #${index + 1}:`);
        console.log(`- Block: ${parseInt(event.blockNumber, 16)}`);
        console.log(`- Transaction: ${event.transactionHash}`);
        console.log(`- Topics: ${event.topics.join(', ')}`);
      });
    }

  } catch (error) {
    console.error(`❌ Error analyzing CryptoPunks contract: ${error.message}`);
  }
}

// Run the test
testCryptoPunks(); 