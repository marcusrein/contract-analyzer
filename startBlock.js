/**
 * GetStartBlock - A utility to find the deployment block of a smart contract
 *
 * This module provides functionality to determine when a contract was deployed
 * on Ethereum or any EVM-compatible blockchain using block explorer APIs.
 */
import path from 'path';
import { getContractInfo } from './contractInfo.js';
import fs from 'fs/promises';

/**
 * Get the block where a contract was deployed using the block explorer API
 * @param {string} rpcUrl - Not used - kept for backward compatibility
 * @param {string} address - Contract address
 * @param {string} apiKey - Block explorer API key
 * @param {string} explorerApiUrl - The explorer API URL
 * @param {string} chainName - The name of the chain being analyzed
 * @returns {Promise<Object>} The object containing contract, deployment info and ABI
 */
export async function getDeploymentBlock(
  rpcUrl,
  address,
  apiKey,
  explorerApiUrl,
  chainName = 'ethereum',
) {
  if (!apiKey) {
    console.error('❌ No explorer API key provided');
    return null;
  }

  if (!explorerApiUrl) {
    console.error('❌ No explorer API URL provided');
    return null;
  }

  console.log(`\n🔍 Analyzing contract: ${address}`);

  // Check if this is a known contract with a hardcoded deployment block
  // This is used for old or complex contracts where the explorer API might not return deployment info
  const knownContracts = {
    '0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb': {
      // CryptoPunks
      name: 'CryptoPunks',
      deploymentBlock: 3914495, // June 22, 2017
    },
    '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d': {
      // Bored Ape Yacht Club
      name: 'Bored Ape Yacht Club',
      deploymentBlock: 12287507, // April 30, 2021
    },
  };

  const normalizedAddress = address.toLowerCase();
  const knownContract = knownContracts[normalizedAddress];

  if (knownContract) {
    console.log(`✅ Recognized as known contract: ${knownContract.name}`);
    console.log(`✅ Using deployment block: ${knownContract.deploymentBlock}`);

    // Continue with contract analysis using the known deployment block
    return await analyzeContractFromBlockscanner(
      address,
      knownContract.deploymentBlock,
      apiKey,
      explorerApiUrl,
      chainName,
    );
  }

  try {
    // Check if the address is a contract using the explorer API
    console.log('📝 Verifying contract address using block explorer...');

    // First try to get the contract source code - this will tell us if it's a contract
    let sourceRequest;
    try {
      sourceRequest = await fetch(
        `${explorerApiUrl}?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`,
      );
    } catch (fetchError) {
      console.error(
        `❌ Network error fetching initial source for ${address}: ${fetchError.message}`,
      );
      throw new Error(
        `NETWORK_ERROR: Failed to connect to block explorer API: ${fetchError.message}.`,
      );
    }

    if (!sourceRequest.ok) {
      const errorBody = await sourceRequest.text();
      console.error(
        `❌ API Error fetching initial source for ${address}: HTTP ${sourceRequest.status} ${sourceRequest.statusText}. Body: ${errorBody}`,
      );
      throw new Error(
        `NETWORK_ERROR: Block explorer API returned status ${sourceRequest.status}: ${sourceRequest.statusText}`,
      );
    }

    let sourceData;
    try {
      sourceData = await sourceRequest.json();
    } catch (jsonError) {
      console.error(
        `❌ JSON Parsing Error fetching initial source for ${address}: ${jsonError.message}`,
      );
      throw new Error(
        `NETWORK_ERROR: Failed to parse response from block explorer: ${jsonError.message}`,
      );
    }

    // If it returns with status 1 and has a result, but the ABI is "Contract source code not verified",
    // it's likely still a contract, just not verified
    if (
      sourceData.status === '1' &&
      sourceData.result &&
      sourceData.result.length > 0 &&
      (sourceData.result[0].ABI !== 'Contract source code not verified' ||
        sourceData.result[0].ContractName !== '')
    ) {
      console.log('✅ Address confirmed as a contract');
    } else {
      // Double check with contract creation endpoint
      let creationRequest;
      try {
        creationRequest = await fetch(
          `${explorerApiUrl}?module=contract&action=getcontractcreation&contractaddresses=${address}&apikey=${apiKey}`,
        );
      } catch (fetchError) {
        console.error(`❌ Network error fetching contract creation for ${address}: ${fetchError.message}`);
        throw new Error(`NETWORK_ERROR: Failed to connect to block explorer API: ${fetchError.message}.`);
      }

      if (!creationRequest.ok) {
        const errorBody = await creationRequest.text();
        console.error(`❌ API Error fetching contract creation for ${address}: HTTP ${creationRequest.status} ${creationRequest.statusText}. Body: ${errorBody}`);
        throw new Error(`NETWORK_ERROR: Block explorer API returned status ${creationRequest.status}: ${creationRequest.statusText}`);
      }

      let creationData;
      try {
        creationData = await creationRequest.json();
      } catch (jsonError) {
        console.error(`❌ JSON Parsing Error fetching contract creation for ${address}: ${jsonError.message}`);
        throw new Error(`NETWORK_ERROR: Failed to parse response from block explorer: ${jsonError.message}`);
      }

      if (creationData.status === '1' && creationData.result && creationData.result.length > 0) {
        console.log('✅ Address confirmed as a contract via creation transaction');
      } else {
        console.error(
          '⚠️ The address provided may not be a contract or is not found on this network',
        );
        return null;
      }
    }

    // Get deployment block from explorer API
    const deploymentBlock = await getContractCreationFromExplorer(explorerApiUrl, apiKey, address);

    if (!deploymentBlock) {
      console.error('❌ Could not find deployment block using explorer API');
      return null;
    }

    console.log(`\n📋 Contract deployed at block ${deploymentBlock}`);

    // Continue with contract analysis using only blockscanner API
    return await analyzeContractFromBlockscanner(
      address,
      deploymentBlock,
      apiKey,
      explorerApiUrl,
      chainName,
    );
  } catch (error) {
    let errorMessage = error.message;

    // Check for common errors
    if (
      error.message.includes('rate limit') ||
      error.message.includes('429') ||
      error.message.includes('Max rate limit reached')
    ) {
      errorMessage =
        'NETWORK_ERROR: Explorer API rate limit exceeded. Try again later or use a different API key.';
    } else if (
      error.message.includes('Invalid API key') ||
      error.message.includes('API key missing')
    ) {
      errorMessage = 'API_KEY_ERROR: Invalid or missing explorer API key.';
    }

    console.error(`❌ Error analyzing contract: ${errorMessage}`);
    throw new Error(errorMessage);
  }
}

/**
 * Get contract creation information directly from the block explorer API
 * @param {string} explorerApiUrl - The explorer API URL
 * @param {string} apiKey - The explorer API key
 * @param {string} address - The contract address
 * @returns {Promise<number|null>} - The deployment block or null if not found
 */
async function getContractCreationFromExplorer(explorerApiUrl, apiKey, address) {
  try {
    // Try to get contract creation info directly from explorer API
    const creationUrl = `${explorerApiUrl}?module=contract&action=getcontractcreation&contractaddresses=${address}&apikey=${apiKey}`;

    console.log(`🔍 Fetching contract creation info from block explorer...`);

    const response = await fetch(creationUrl);
    const data = await response.json();

    if (data.status === '1' && data.result && data.result.length > 0) {
      const txHash = data.result[0].txHash;
      console.log(`✅ Found creation transaction: ${txHash}`);

      // Get the transaction details to find the block number
      const txUrl = `${explorerApiUrl}?module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&apikey=${apiKey}`;
      const txResponse = await fetch(txUrl);
      const txData = await txResponse.json();

      if (txData.result && txData.result.blockNumber) {
        const blockNumber = parseInt(txData.result.blockNumber, 16);
        console.log(`✅ Contract was deployed at block ${blockNumber}`);
        return blockNumber;
      }
    } else {
      const errorMsg = data.message || 'No creation info found';
      console.log(`⚠️ Explorer API response: ${errorMsg}`);

      if (data.status === '0' && data.message && data.message.includes('Invalid API Key')) {
        throw new Error('Invalid API key provided to block explorer');
      }
    }

    return null;
  } catch (error) {
    console.log(`⚠️ Error getting contract creation from explorer: ${error.message}`);
    throw error; // Re-throw to handle in main function
  }
}

/**
 * Analyze contract using only blockscanner API
 * @param {string} address - Contract address
 * @param {number} deploymentBlock - The known deployment block
 * @param {string} apiKey - Explorer API key
 * @param {string} explorerApiUrl - The explorer API URL
 * @param {string} chainName - The name of the chain being analyzed
 * @returns {Promise<Object>} - The analysis result
 */
async function analyzeContractFromBlockscanner(
  address,
  deploymentBlock,
  apiKey,
  explorerApiUrl,
  chainName = 'ethereum',
) {
  // Get the latest block using the explorer API
  console.log('📝 Fetching latest block...');
  let blockResponse;
  try {
    blockResponse = await fetch(
      `${explorerApiUrl}?module=proxy&action=eth_blockNumber&apikey=${apiKey}`,
    );
  } catch (fetchError) {
    console.error(`❌ Network error fetching latest block: ${fetchError.message}`);
    throw new Error(`NETWORK_ERROR: Failed to connect to block explorer API: ${fetchError.message}.`);
  }

  if (!blockResponse.ok) {
    const errorBody = await blockResponse.text();
    console.error(`❌ API Error fetching latest block: HTTP ${blockResponse.status} ${blockResponse.statusText}. Body: ${errorBody}`);
    throw new Error(`NETWORK_ERROR: Block explorer API returned status ${blockResponse.status}: ${blockResponse.statusText}`);
  }
  
  let blockData;
  try {
    blockData = await blockResponse.json();
  } catch (jsonError) {
    console.error(`❌ JSON Parsing Error fetching latest block: ${jsonError.message}`);
    throw new Error(`NETWORK_ERROR: Failed to parse response from block explorer: ${jsonError.message}`);
  }

  // Log the raw response for debugging
  console.log('Raw blockData:', JSON.stringify(blockData, null, 2));

  // Check only for the existence of result for JSON-RPC response
  if (!blockData.result) {
    console.error(
      `❌ Could not determine latest block. Status: ${blockData.status}, Message: ${blockData.message || ''}. Cannot proceed with analysis.`,
    );
    return null;
  }

  const latestBlock = parseInt(blockData.result, 16);

  console.log(`✅ Latest block: ${latestBlock}`);

  // Get contract information
  console.log('📝 Fetching contract information...');

  // We'll use getContractInfo but pass only necessary parameters
  const contractInfo = await getContractInfo(null, address, apiKey, explorerApiUrl);

  if (!contractInfo) {
    console.log(
      '⚠️ Could not retrieve contract information. The block explorer API may be unavailable or rate limited.',
    );
    console.log('ℹ️ Continuing analysis with limited data (unverified contract)...');
  } else {
    console.log('✅ Contract information retrieved');

    // Log the explorer URLs if available
    if (contractInfo.explorerUrl) {
      console.log(`🔗 Explorer Link: ${contractInfo.explorerUrl}`);
    }

    if (contractInfo.sourceUrl && contractInfo.isVerified) {
      console.log(`🔗 Source Code Link: ${contractInfo.sourceUrl}`);
    } else {
      console.log('ℹ️ No source code available (contract not verified)');
    }
  }

  // Get events directly from blockscanner
  console.log('📝 Fetching contract events...');
  let events = [];

  try {
    // Determine a safe block range to avoid timeout issues on Etherscan
    // For large contracts like CryptoPunks, we need smaller ranges
    const blockRange = 10000; // Default block range
    const maxEventsToFetch = 500; // Cap on total events to fetch

    // For known popular contracts, use smaller ranges
    if (address.toLowerCase() === '0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb') {
      // CryptoPunks
      console.log('🧩 Optimizing for high-volume contract');
    }

    // Check how many blocks we need to scan
    const blocksToScan = latestBlock - deploymentBlock;
    console.log(
      `📊 Scanning ${blocksToScan.toLocaleString()} blocks (${deploymentBlock} → ${latestBlock})`,
    );

    // Split into smaller ranges if needed
    if (blocksToScan > blockRange) {
      const numChunks = Math.min(10, Math.ceil(blocksToScan / blockRange));
      const actualBlockRange = Math.ceil(blocksToScan / numChunks);

      console.log(`🔄 Scanning in ${numChunks} chunks (${actualBlockRange} blocks each)`);

      // Fetch events in chunks
      for (let i = 0; i < numChunks; i++) {
        if (events.length >= maxEventsToFetch) {
          console.log(`⚠️ Reached max event cap (${maxEventsToFetch}). Stopping retrieval.`);
          break;
        }

        const fromBlock = deploymentBlock + i * actualBlockRange;
        const toBlock = Math.min(latestBlock, deploymentBlock + (i + 1) * actualBlockRange - 1);

        // Show progress as percent complete
        const progress = Math.round((i / numChunks) * 100);
        const progressBar = `[${'█'.repeat(Math.floor(progress / 5))}${' '.repeat(20 - Math.floor(progress / 5))}]`;

        console.log(`📝 Chunk ${i + 1}/${numChunks} (${progress}%) ${progressBar}`);

        // Try both Transfer and Assign events (common in NFT contracts like CryptoPunks)
        let fetchedEventsResponse;
        try {
          fetchedEventsResponse = await fetch(
            `${explorerApiUrl}?module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=${toBlock}&address=${address}&apikey=${apiKey}`,
          );
        } catch (fetchError) {
          console.warn(`⚠️ Network Error fetching events chunk ${i + 1}: ${fetchError.message}. Skipping chunk.`);
          continue; // Skip this chunk
        }

        if (!fetchedEventsResponse.ok) {
          const errorBody = await fetchedEventsResponse.text();
          console.warn(
            `⚠️ API Error fetching events chunk ${i + 1}: HTTP ${fetchedEventsResponse.status} ${fetchedEventsResponse.statusText}. Body: ${errorBody}. Skipping chunk.`,
          );
          continue; // Skip this chunk
        }
        
        let eventsData;
        try {
          eventsData = await fetchedEventsResponse.json();
        } catch (jsonError) {
          console.warn(`⚠️ JSON Parsing Error fetching events chunk ${i + 1}: ${jsonError.message}. Skipping chunk.`);
          continue; // Skip this chunk
        }

        if (eventsData.status === '1' && eventsData.result) {
          const newEvents = eventsData.result.length;
          console.log(`✅ Found ${newEvents} events (${events.length + newEvents} total)`);
          events = events.concat(eventsData.result);

          if (events.length > maxEventsToFetch) {
            console.log(`⚠️ Reached ${maxEventsToFetch} event limit. Trimming excess.`);
            events = events.slice(0, maxEventsToFetch);
          }
        } else {
          console.warn(
            `⚠️ API Warning fetching events chunk ${i + 1}: Status ${eventsData.status}, Message: ${eventsData.message || 'Unknown'}. Skipping chunk.`,
          );
          // continue; // Already handled by skipping if status !== '1'
        }

        // Add a slight delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000)); // Increased delay to 1000ms (1 second)
      }
    } else {
      // If range is small enough, fetch in one go
      const eventsResponse = await fetch(
        `${explorerApiUrl}?module=logs&action=getLogs&fromBlock=${deploymentBlock}&toBlock=latest&address=${address}&apikey=${apiKey}`,
      );
      const eventsData = await eventsResponse.json();

      if (eventsData.status === '1' && eventsData.result) {
        events = eventsData.result.slice(0, maxEventsToFetch);
        console.log(`✅ Retrieved ${events.length} events`);
      } else {
        console.log(`ℹ️ No events found or API error: ${eventsData.message || 'Unknown'}`);
      }
    }
  } catch (error) {
    console.error(`⚠️ Error fetching events: ${error.message}`);
  }

  // Create a unique folder name based on contract name, chain, and date
  const date = new Date();
  const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  // Get contract name, defaulting to address if not available
  const contractName = contractInfo?.contractName || address.slice(0, 10);

  // Sanitize folder name to remove special characters
  const sanitizedContractName = contractName.replace(/[^a-zA-Z0-9-_]/g, '_');
  const sanitizedChainName = chainName.replace(/[^a-zA-Z0-9-_]/g, '_');

  // Create folder name
  const folderName = `${sanitizedContractName}_${sanitizedChainName}_${dateString}`;

  // Skip file saving for unverified contracts
  if (!contractInfo?.isVerified) {
    console.log('ℹ️ Contract is not verified. Skipping file saving to disk.');
    return {
      deploymentBlock,
      contractInfo,
      events,
      outputDir: folderName, // Return the folder name for use in the CLI
    };
  }

  // Create base directory for all analyzed contracts
  const baseDir = path.join(process.cwd(), 'contracts-analyzed');
  await fs.mkdir(baseDir, { recursive: true });

  // Create directory for this specific contract analysis
  const outputDir = path.join(baseDir, folderName);
  await fs.mkdir(outputDir, { recursive: true });

  // Create contract directory
  const contractDir = path.join(outputDir, 'contract');
  await fs.mkdir(contractDir, { recursive: true });

  // Save Proxy ABI to file
  if (contractInfo?.abi) {
    await fs.writeFile(
      path.join(outputDir, 'abi.json'), // Save as abi.json (proxy ABI)
      JSON.stringify(contractInfo.abi, null, 2),
    );
    console.log(`💾 Proxy ABI saved to ${folderName}/abi.json`);
  }

  // Save Combined ABI to file if it exists
  if (contractInfo?.combinedAbi) {
    await fs.writeFile(
      path.join(outputDir, 'combined.abi.json'), // Save as combined.abi.json
      JSON.stringify(contractInfo.combinedAbi, null, 2),
    );
    console.log(`💾 Combined ABI saved to ${folderName}/combined.abi.json`);
  } else if (contractInfo?.proxy && contractInfo?.implementation) {
    // Only log warning if it was expected (proxy with implementation) but failed
    console.log(
      'ℹ️ Combined ABI not generated (likely due to implementation fetch failure). Only Proxy ABI saved.',
    );
  } else if (!contractInfo?.proxy) {
    // If not a proxy, the main ABI is the only one
    console.log('ℹ️ Not a proxy contract, only standard ABI saved.');
  } else {
    console.log('ℹ️ Combined ABI not available.'); // General case
  }

  // Save source code to file if available
  if (contractInfo?.sourceCode) {
    const sourceCode = contractInfo.sourceCode;

    // Check if the source code is in JSON format
    if (sourceCode.trim().startsWith('{') || sourceCode.trim().startsWith('{{')) {
      try {
        // Try parsing as multi-file JSON format first (standard in Hardhat/Foundry artifacts)
        console.log('Attempting to parse JSON source code...');
        const parsedSource = JSON.parse(contractInfo.sourceCode);
        
        let mainContractPath = '';
        let extractedFiles = 0;

        // Save each contract file separately
        for (const [filePath, fileInfo] of Object.entries(parsedSource.sources)) {
          if (fileInfo.content) {
            const fileName = filePath.split('/').pop();
            const fileSavePath = path.join(contractDir, fileName);

            await fs.writeFile(fileSavePath, fileInfo.content);
            extractedFiles++;

            // Track the main contract file for reference
            if (contractInfo.contractName && filePath.includes(contractInfo.contractName)) {
              mainContractPath = fileName;
            }

            console.log(`💾 Source file saved to ${folderName}/contract/${fileName}`);
          }
        }

        // Create a manifest file to help identify the main contract
        if (extractedFiles > 0) {
          const manifest = {
            contractName: contractInfo.contractName || 'Unknown',
            mainContractFile: mainContractPath,
            extractedFiles: extractedFiles,
            timestamp: new Date().toISOString(),
          };

          await fs.writeFile(
            path.join(contractDir, 'manifest.json'),
            JSON.stringify(manifest, null, 2),
          );

          console.log(`📋 Contract manifest saved to ${folderName}/contract/manifest.json`);
        }

        // Also save a copy of the original source code in the contract directory
        await fs.writeFile(path.join(contractDir, 'original_source.txt'), sourceCode);
        console.log(`💾 Source code saved to ${folderName}/contract/original_source.txt`);
      } catch (e) {
        // If parsing fails, save the original source code
        console.warn(`Note: Could not parse source code as JSON: ${e.message}`);
        await fs.writeFile(path.join(contractDir, 'original_source.txt'), sourceCode);
        console.log(`💾 Source code saved to ${folderName}/contract/original_source.txt`);
      }
    } else {
      // Not in JSON format, save as-is
      await fs.writeFile(path.join(contractDir, 'contract_source.sol'), sourceCode);
      console.log(`💾 Source code saved to ${folderName}/contract/contract_source.sol`);
    }
  }

  // Save events to file - limiting to 3 examples per event type
  if (events && events.length > 0) {
    // Group events by topic0 (event signature)
    const eventsByType = {};
    events.forEach(event => {
      const eventType = event.topics && event.topics[0] ? event.topics[0] : 'unknown';
      if (!eventsByType[eventType]) {
        eventsByType[eventType] = [];
      }
      // Only keep the first 3 examples of each event type
      if (eventsByType[eventType].length < 3) {
        eventsByType[eventType].push(event);
      }
    });

    // Flatten the grouped events back to an array
    const limitedEvents = Object.values(eventsByType).flat();

    // Store metadata with the events
    const eventsData = {
      metadata: {
        description:
          'This file contains comprehensive event data for the analyzed contract: (1) Event signatures with full definitions and parameter details for all detected event types, and (2) Exactly 3 real on-chain examples of each event type with complete blockchain data for reference and analysis.',
        totalEventsFound: events.length,
        limitedToExamples: true,
        examplesPerEventType: 3,
        uniqueEventTypes: Object.keys(eventsByType).length,
        contract_verified: contractInfo?.isVerified || false,
      },
      eventSignatures: contractInfo?.eventSignatures || [],
      'event-examples': limitedEvents,
    };

    await fs.writeFile(
      path.join(outputDir, 'event-information.json'),
      JSON.stringify(eventsData, null, 2),
    );
    console.log(
      `💾 Events saved to ${folderName}/event-information.json (3 examples per event type)`,
    );
  } else {
    // Even if no events were found, create a basic event information file
    // This ensures that the CLI doesn't error when trying to display event information
    const emptyEventsData = {
      metadata: {
        description:
          'No events were found for this contract during the analysis period. This could be because the contract is new, inactive, or the block range scanned was insufficient.',
        totalEventsFound: 0,
        contract_verified: contractInfo?.isVerified || false,
      },
      eventSignatures: contractInfo?.eventSignatures || [],
      'event-examples': [],
    };

    await fs.writeFile(
      path.join(outputDir, 'event-information.json'),
      JSON.stringify(emptyEventsData, null, 2),
    );
    console.log(
      `💾 Empty events file saved to ${folderName}/event-information.json (no events found)`,
    );
  }

  return {
    deploymentBlock,
    contractInfo,
    events,
    outputDir: folderName, // Return the folder name for use in the CLI
  };
}

// Default execution when run directly
if (import.meta.url === import.meta.main) {
  // Use the Infura RPC URL for Base mainnet
  const rpcUrl = 'https://base-mainnet.infura.io/v3/4e338994a5c2486988b490c29e9dc69f';
  const contractAddress = '0x227f65131A261548b057215bB1D5Ab2997964C7d';
  const explorerApiKey = process.env.ETHERSCAN_API_KEY;

  if (!explorerApiKey) {
    console.error('Please set the ETHERSCAN_API_KEY environment variable');
    process.exit(1);
  }

  getDeploymentBlock(rpcUrl, contractAddress, explorerApiKey);
}
