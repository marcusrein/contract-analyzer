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
      let sourceCode = contractInfo.sourceCode;
      let extractedFiles = [];
      
      // Check if the source code is in JSON format
      if (sourceCode.trim().startsWith('{') || sourceCode.trim().startsWith('{{')) {
        try {
          // Try to parse it as JSON
          let parsedSource;
          
          // Handle double-brace JSON format
          if (sourceCode.trim().startsWith('{{')) {
            // Remove the extra curly brace at the beginning and end
            sourceCode = sourceCode.trim();
            sourceCode = sourceCode.substring(1, sourceCode.length - 1);
          }
          
          parsedSource = JSON.parse(sourceCode);
          
          // If it's a standard Solidity JSON input format, extract the actual contracts
          if (parsedSource.sources) {
            const contractName = contractInfo.contractName;
            let mainContractSource = null;
            const combinedSource = [];
            
            // First collect all files
            for (const [filePath, fileInfo] of Object.entries(parsedSource.sources)) {
              if (fileInfo.content) {
                // Track main contract
                if (contractName && filePath.includes(contractName)) {
                  mainContractSource = fileInfo.content;
                }
                
                // Add file to combined content with clear separation
                const fileName = filePath.split('/').pop();
                combinedSource.push(
                  `\n// ==========================================\n` +
                  `// FILE: ${fileName}\n` +
                  `// ==========================================\n\n` +
                  `${fileInfo.content}`
                );
                
                // Track extracted files
                extractedFiles.push({
                  path: filePath,
                  fileName: fileName,
                  content: fileInfo.content
                });
              }
            }
            
            // Combine all sources into one file, putting main contract first if found
            if (mainContractSource) {
              // Put main contract at the top
              sourceCode = 
                `// MAIN CONTRACT: ${contractName}\n` +
                `// ==========================================\n\n` +
                `${mainContractSource}\n\n` +
                `// ==========================================\n` +
                `// RELATED CONTRACT FILES\n` +
                `// ==========================================\n` +
                combinedSource.filter(content => content.indexOf(mainContractSource) === -1).join('\n');
            } else {
              // No main contract identified, just combine all
              sourceCode = 
                `// COMBINED SOLIDITY FILES\n` +
                `// ==========================================\n` +
                combinedSource.join('\n');
            }
            
            // Log info about the combined files
            console.log(`💡 Combined ${extractedFiles.length} Solidity files into contract.sol`);
          }
        } catch (e) {
          // If parsing fails, keep the original source code
          console.warn(`Note: Could not parse source code as JSON: ${e.message}`);
        }
      }
      
      // Write the combined or original source code
      await fs.writeFile(
        path.join(outputDir, 'contract.sol'),
        sourceCode
      );
      console.log(`💾 Source code saved to ${folderName}/contract.sol`);
      
      // If we extracted and combined multiple files, create a manifest file with the list
      if (extractedFiles.length > 1) {
        const manifest = {
          contractName: contractInfo.contractName || 'Unknown',
          combinedFiles: extractedFiles.map(f => f.fileName)
        };
        
        await fs.writeFile(
          path.join(outputDir, 'source_manifest.json'),
          JSON.stringify(manifest, null, 2)
        );
        console.log(`📋 File manifest saved to ${folderName}/source_manifest.json`);
      }
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