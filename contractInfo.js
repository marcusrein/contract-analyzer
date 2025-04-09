/**
 * ContractInfo - A utility to fetch contract verification status, ABI, and source code
 *
 * This module provides functionality to retrieve contract information from Etherscan
 * and similar block explorers for EVM-compatible chains.
 */
import { ethers } from 'ethers';

/**
 * Get common NFT event signatures for known contracts like CryptoPunks
 * Used when ABI is not available or incomplete
 *
 * @param {string} contractAddress - The contract address
 * @returns {Array} Array of event signatures for common NFT events
 */
function getCommonNFTEventSignatures(contractAddress) {
  const isLowerCase = contractAddress.toLowerCase();

  // Common NFT event signatures
  const commonEvents = [
    {
      name: 'Transfer',
      signature: 'Transfer(address,address,uint256)',
      signatureHash: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      inputs: [
        { name: 'from', type: 'address', indexed: true },
        { name: 'to', type: 'address', indexed: true },
        { name: 'tokenId', type: 'uint256', indexed: true },
      ],
      anonymous: false,
    },
    {
      name: 'Approval',
      signature: 'Approval(address,address,uint256)',
      signatureHash: '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
      inputs: [
        { name: 'owner', type: 'address', indexed: true },
        { name: 'approved', type: 'address', indexed: true },
        { name: 'tokenId', type: 'uint256', indexed: true },
      ],
      anonymous: false,
    },
    {
      name: 'ApprovalForAll',
      signature: 'ApprovalForAll(address,address,bool)',
      signatureHash: '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31',
      inputs: [
        { name: 'owner', type: 'address', indexed: true },
        { name: 'operator', type: 'address', indexed: true },
        { name: 'approved', type: 'bool', indexed: false },
      ],
      anonymous: false,
    },
  ];

  // CryptoPunks specific events
  if (isLowerCase === '0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb') {
    return [
      ...commonEvents,
      {
        name: 'Assign',
        signature: 'Assign(address,uint256)',
        signatureHash: '0x8a0e37b73a0d9c82e205d4d1a3ff3d0b57ce5f4d7bccf6bac03336dc101cb7ba',
        inputs: [
          { name: 'to', type: 'address', indexed: true },
          { name: 'punkIndex', type: 'uint256', indexed: false },
        ],
        anonymous: false,
      },
      {
        name: 'PunkTransfer',
        signature: 'PunkTransfer(address,address,uint256)',
        signatureHash: '0x05af636b70da6819000c49f85b21fa82081c632069bb626f30932034099107d8',
        inputs: [
          { name: 'from', type: 'address', indexed: true },
          { name: 'to', type: 'address', indexed: true },
          { name: 'punkIndex', type: 'uint256', indexed: false },
        ],
        anonymous: false,
      },
      {
        name: 'PunkBought',
        signature: 'PunkBought(uint256,uint256,address,address)',
        signatureHash: '0x58e5d5a525e3b40bc15abaa38b5882678db1ee68befd2f60bafe3a7fd06db9e3',
        inputs: [
          { name: 'punkIndex', type: 'uint256', indexed: false },
          { name: 'value', type: 'uint256', indexed: false },
          { name: 'fromAddress', type: 'address', indexed: true },
          { name: 'toAddress', type: 'address', indexed: true },
        ],
        anonymous: false,
      },
    ];
  }

  return commonEvents;
}

/**
 * Get contract verification status and ABI from block explorer
 *
 * @param {string} rpcUrl - Not used - kept for backward compatibility
 * @param {string} contractAddress - The address of the contract to check
 * @param {string} explorerApiKey - API key for the block explorer
 * @param {string} [blockExplorerUrl='https://api.etherscan.io/api'] - Block explorer API URL
 * @returns {Promise<Object>} Object containing verification status, ABI, and source code
 */
async function getContractInfo(
  rpcUrl,
  contractAddress,
  explorerApiKey,
  blockExplorerUrl = 'https://api.etherscan.io/api'
) {
  try {
    // Validate input parameters
    if (
      !contractAddress ||
      typeof contractAddress !== 'string' ||
      !ethers.isAddress(contractAddress)
    ) {
      throw new Error('VALIDATION_ERROR: Invalid contract address provided');
    }

    if (!explorerApiKey) {
      throw new Error('API_KEY_ERROR: Block explorer API key is required');
    }

    if (explorerApiKey.includes('your-') || explorerApiKey === 'your-key') {
      throw new Error('API_KEY_ERROR: Block explorer API key contains placeholder text');
    }

    // Get website URL for explorer links
    const blockScannerWebsiteUrl = process.env.BLOCKSCANNER_URL || 'https://etherscan.io';

    // Fetch contract source code and ABI
    let response;
    try {
      response = await fetch(
        `${blockExplorerUrl}?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${explorerApiKey}`
      );
    } catch (fetchError) {
      throw new Error(
        `NETWORK_ERROR: Failed to connect to block explorer API: ${fetchError.message}. Please check your internet connection.`
      );
    }

    if (!response.ok) {
      throw new Error(
        `NETWORK_ERROR: Block explorer API returned status ${response.status}: ${response.statusText}`
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      throw new Error(
        `NETWORK_ERROR: Failed to parse response from block explorer: ${jsonError.message}`
      );
    }

    if (data.status !== '1') {
      console.warn(`Warning: Block explorer returned non-success status: ${data.message}`);
    }

    if (!data.result || !Array.isArray(data.result) || data.result.length === 0) {
      console.log(
        '⚠️ Contract data not found or API error. Creating limited information object...'
      );
      // Return a minimal object instead of null for unverified/unknown contracts
      return {
        isVerified: false,
        abi: null,
        contractName: 'Unverified Contract',
        compiler: '',
        sourceCode: '',
        proxy: false,
        implementation: '',
        eventSignatures: getCommonNFTEventSignatures(contractAddress),
        explorerUrl: `${blockScannerWebsiteUrl}/address/${contractAddress}`,
        sourceUrl: null,
      };
    }

    const contractData = data.result[0];
    const isVerified = contractData.ABI !== 'Contract source code not verified';

    // Parse ABI if contract is verified
    let abi = null;
    if (isVerified && contractData.ABI !== '') {
      try {
        abi = JSON.parse(contractData.ABI);
      } catch (abiError) {
        console.warn(`Warning: Could not parse ABI: ${abiError.message}`);
      }
    }

    // Check if the contract is a proxy
    let isProxy = false;
    let implementation = '';

    // Detect various proxy patterns
    if (contractData.Implementation && contractData.Implementation !== '') {
      isProxy = true;
      implementation = contractData.Implementation;
      console.log(`✅ Proxy contract detected with implementation at ${implementation}`);
    } else if (contractData.SourceCode && contractData.SourceCode.includes('delegatecall')) {
      isProxy = true;
      console.log(`⚠️ Potential proxy contract detected (delegatecall found in source code)`);

      // Try to extract implementation address from source code for common patterns
      if (contractData.SourceCode) {
        // Look for common implementation storage patterns
        const implementationPatterns = [
          /(?:_?IMPLEMENTATION_?(?:_SLOT)?)\s*=\s*(?:0x[a-fA-F0-9]{64}|keccak256\([^)]+\))/,
          /(?:implementation(?:Slot)?)\s*=\s*(?:0x[a-fA-F0-9]{64}|keccak256\([^)]+\))/,
          /(?:IMPLEMENTATION_SLOT)\s*=\s*(?:0x[a-fA-F0-9]{64}|bytes32\([^)]+\))/,
          /(?:_IMPLEMENTATION_SLOT)\s*=\s*(?:0x[a-fA-F0-9]{64}|bytes32\([^)]+\))/,
        ];

        for (const pattern of implementationPatterns) {
          if (pattern.test(contractData.SourceCode)) {
            console.log(`📝 Found implementation storage slot pattern in source code`);
            break;
          }
        }
      }
    } else if (
      contractData.SourceCode &&
      (contractData.SourceCode.includes('upgradeable') ||
        contractData.SourceCode.includes('ERC1967Proxy') ||
        contractData.SourceCode.includes('TransparentUpgradeableProxy'))
    ) {
      isProxy = true;
      console.log(`⚠️ Upgradeable proxy pattern detected in source code`);
    }

    let implementationAbi = null;
    let combinedAbi = null; // Initialize as null
    let implementationVerified = false;
    let implementationContractName = '';

    // If it's a proxy and we have the implementation address, fetch its ABI
    if (isProxy && implementation && ethers.isAddress(implementation)) {
      console.log(`\n🔎 Fetching implementation contract info for ${implementation}...`);
      try {
        const implResponse = await fetch(
          `${blockExplorerUrl}?module=contract&action=getsourcecode&address=${implementation}&apikey=${explorerApiKey}`
        );
        if (!implResponse.ok) {
          console.warn(
            `Warning: Could not fetch implementation ABI (HTTP ${implResponse.status}).`
          );
        } else {
          const implData = await implResponse.json();
          if (implData.status === '1' && implData.result && implData.result.length > 0) {
            const implContractData = implData.result[0];
            implementationContractName = implContractData.ContractName || ''; // Store name
            if (
              implContractData.ABI &&
              implContractData.ABI !== 'Contract source code not verified'
            ) {
              try {
                implementationAbi = JSON.parse(implContractData.ABI);
                implementationVerified = true; // Mark as verified
                console.log(`✅ Successfully fetched and parsed implementation ABI.`);
                // Combine ABIs ONLY if implementation ABI is valid
                combinedAbi = combineAbis(abi, implementationAbi);
                console.log(`✅ Combined ABI created.`);
              } catch (implAbiError) {
                console.warn(
                  `Warning: Could not parse implementation ABI: ${implAbiError.message}`
                );
              }
            } else {
              console.warn(
                `Warning: Implementation contract (${implementation}) source code not verified or ABI is empty.`
              );
            }
          } else {
            console.warn(
              `Warning: Could not retrieve implementation contract data: ${implData.message || 'Unknown API error'}`
            );
          }
        }
      } catch (implFetchError) {
        console.warn(
          `Warning: Error fetching implementation contract info: ${implFetchError.message}`
        );
      }
    }

    // Extract event signatures from ABI (Use combined ABI if available, else original proxy ABI)
    let eventSignatures = [];
    const abiToUseForEvents = combinedAbi || abi; // Use combined if available, else original proxy abi
    if (abiToUseForEvents) {
      eventSignatures = extractEventSignatures(abiToUseForEvents);
    }

    // If no event signatures were found but this is a known contract, use common signatures
    if (eventSignatures.length === 0) {
      console.log('⚠️ No event signatures found in ABI. Using common NFT event signatures...');
      eventSignatures = getCommonNFTEventSignatures(contractAddress);
    }

    // Create the result object
    const result = {
      isVerified,
      abi, // Original proxy ABI
      contractName: contractData.ContractName || '',
      compiler: contractData.CompilerVersion || '',
      sourceCode: contractData.SourceCode || '',
      proxy: isProxy,
      implementation: implementation,
      implementationAbi: implementationAbi,
      combinedAbi: combinedAbi,
      implementationVerified: implementationVerified,
      implementationContractName: implementationContractName,
      eventSignatures, // Signatures from combined or original ABI
      // Add direct link to the contract on the block explorer
      explorerUrl: `${blockScannerWebsiteUrl}/address/${contractAddress}`,
      // Add link to the contract source code if verified
      sourceUrl: isVerified ? `${blockScannerWebsiteUrl}/address/${contractAddress}#code` : null,
      // Add a function to generate subgraph templates if the contract is verified
      generateSubgraphTemplates: isVerified
        ? () => generateSubgraphTemplates(contractAddress, abi, eventSignatures)
        : null,
    };

    return result;
  } catch (error) {
    console.error(`Error in getContractInfo: ${error.message}`);
    throw error;
  }
}

/**
 * Combines two ABIs, prioritizing entries from the implementation ABI.
 * Removes duplicates based on function/event signatures.
 *
 * @param {Array|null} proxyAbi - The ABI of the proxy contract.
 * @param {Array|null} implementationAbi - The ABI of the implementation contract.
 * @returns {Array|null} The combined ABI array, or null if both inputs are null.
 */
function combineAbis(proxyAbi, implementationAbi) {
  if (!proxyAbi && !implementationAbi) {
    return null;
  }
  if (!implementationAbi) {
    return proxyAbi;
  }
  if (!proxyAbi) {
    return implementationAbi;
  }

  const combined = [];
  const signatureMap = new Map(); // Use signature string as key

  const processEntry = entry => {
    // Create a unique signature string (simplified)
    // Note: More robust signature generation might be needed for complex types/overloads
    let signature = '';
    if (entry.type === 'function' || entry.type === 'event' || entry.type === 'error') {
      signature = `${entry.type}:${entry.name}`;
      if (entry.inputs) {
        signature += `(${entry.inputs.map(i => i.type).join(',')})`;
      }
    } else if (entry.type === 'constructor') {
      signature = 'constructor';
      if (entry.inputs) {
        signature += `(${entry.inputs.map(i => i.type).join(',')})`;
      }
    } else if (entry.type === 'receive' || entry.type === 'fallback') {
      signature = entry.type;
    }
    // Skip unknown types or entries without a clear signature
    if (!signature) {
      return;
    }

    if (!signatureMap.has(signature)) {
      signatureMap.set(signature, true);
      combined.push(entry);
    }
  };

  // Prioritize implementation ABI entries
  implementationAbi.forEach(processEntry);
  // Add unique proxy ABI entries
  proxyAbi.forEach(processEntry);

  return combined;
}

/**
 * Extract event signatures from ABI
 *
 * @param {Array} abi - The contract ABI
 * @returns {Array} Array of event signatures
 */
function extractEventSignatures(abi) {
  const events = abi.filter(item => item.type === 'event');

  return events.map(event => {
    const inputs = event.inputs || [];
    const types = inputs.map(input => input.type);
    const signature = `${event.name}(${types.join(',')})`;
    const signatureHash = ethers.id(signature).slice(0, 10);

    return {
      name: event.name,
      signature,
      signatureHash,
      inputs: inputs.map(input => ({
        name: input.name,
        type: input.type,
        indexed: input.indexed || false,
      })),
      anonymous: event.anonymous || false,
    };
  });
}

/**
 * Get events by topic from block explorer instead of using RPC
 *
 * @param {string} blockExplorerUrl - Block explorer API URL
 * @param {string} contractAddress - Address of the contract
 * @param {string} explorerApiKey - API key for the block explorer
 * @param {number} fromBlock - Starting block number
 * @param {number} toBlock - Ending block number
 * @param {string} topic0 - Event signature topic (optional)
 * @returns {Promise<Array>} An array of events from the block explorer
 */
async function getEventsFromExplorer(
  blockExplorerUrl,
  contractAddress,
  explorerApiKey,
  fromBlock,
  toBlock,
  topic0 = null
) {
  try {
    console.log(`🔍 Fetching events from block ${fromBlock} to ${toBlock}...`);

    let url = `${blockExplorerUrl}?module=logs&action=getLogs&address=${contractAddress}&fromBlock=${fromBlock}&toBlock=${toBlock}&apikey=${explorerApiKey}`;

    if (topic0) {
      url += `&topic0=${topic0}`;
      console.log(`🔍 Filtering by topic0: ${topic0}`);
    }

    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        `❌ Block explorer API request failed: ${response.status} ${response.statusText}`
      );
      return [];
    }

    const data = await response.json();

    if (data.status === '1' && Array.isArray(data.result)) {
      console.log(`✅ Retrieved ${data.result.length} events from block explorer`);
      return data.result;
    } else if (data.status === '0' && data.message && data.message.includes('Query Timeout')) {
      console.warn(`⚠️ Block explorer query timeout detected. The range might be too large.`);

      // If the range is too large, try to split it in half and make recursive calls
      if (toBlock - fromBlock > 1000) {
        console.log(`🔄 Splitting block range...`);
        const midBlock = Math.floor((fromBlock + toBlock) / 2);

        // Get events from first half
        const firstHalfEvents = await getEventsFromExplorer(
          blockExplorerUrl,
          contractAddress,
          explorerApiKey,
          fromBlock,
          midBlock,
          topic0
        );

        // Get events from second half
        const secondHalfEvents = await getEventsFromExplorer(
          blockExplorerUrl,
          contractAddress,
          explorerApiKey,
          midBlock + 1,
          toBlock,
          topic0
        );

        // Combine results
        return [...firstHalfEvents, ...secondHalfEvents];
      }

      return [];
    } else {
      console.warn(`⚠️ Block explorer logs returned non-success status: ${data.message}`);
      return [];
    }
  } catch (error) {
    console.error(`❌ Error getting events from explorer: ${error.message}`);
    return [];
  }
}

/**
 * Get contract events (replacement using block explorer instead of RPC)
 * This is kept for backward compatibility but now uses the block explorer API
 *
 * @param {string} rpcUrl - Not used - kept for backward compatibility
 * @param {string} contractAddress - Address of the contract
 * @param {number} fromBlock - Starting block number
 * @param {number} toBlock - Ending block number
 * @param {string} [blockExplorerUrl='https://api.etherscan.io/api'] - Block explorer API URL
 * @param {string} explorerApiKey - API key for the block explorer
 * @returns {Promise<Array>} - An array of contract events
 */
async function getContractEvents(
  rpcUrl,
  contractAddress,
  fromBlock,
  toBlock,
  blockExplorerUrl = 'https://api.etherscan.io/api',
  explorerApiKey
) {
  // For backward compatibility, extract explorer API key from environment if not provided
  if (!explorerApiKey) {
    explorerApiKey = process.env.ETHERSCAN_API_KEY;
  }

  if (!explorerApiKey) {
    console.warn('No block explorer API key provided for event retrieval');
    return [];
  }

  try {
    return await getEventsFromExplorer(
      blockExplorerUrl,
      contractAddress,
      explorerApiKey,
      fromBlock,
      toBlock
    );
  } catch (error) {
    console.error(`Error getting contract events: ${error.message}`);
    return [];
  }
}

/**
 * Generate subgraph schema and mappings for a contract
 *
 * @param {Object} contractInfo - Contract information including ABI
 * @returns {Object} Object containing generated schema and mappings
 */
function generateSubgraphTemplates(contractInfo) {
  if (!contractInfo || !contractInfo.abi || !contractInfo.eventSignatures) {
    return null;
  }

  // Generate GraphQL schema
  let schema = 'type _Schema_\n\n';

  // Add entity types based on events
  contractInfo.eventSignatures.forEach(event => {
    schema += `type ${event.name} @entity {\n`;
    schema += `  id: ID!\n`;
    schema += `  blockNumber: BigInt!\n`;
    schema += `  blockTimestamp: BigInt!\n`;
    schema += `  transactionHash: Bytes!\n`;

    // Add fields based on event parameters
    event.inputs.forEach(input => {
      let graphqlType;

      switch (input.type) {
        case 'address':
          graphqlType = 'Bytes';
          break;
        case 'uint256':
        case 'int256':
          graphqlType = 'BigInt';
          break;
        case 'bool':
          graphqlType = 'Boolean';
          break;
        case 'string':
          graphqlType = 'String';
          break;
        default:
          if (input.type.includes('[]')) {
            graphqlType = '[Bytes!]';
          } else {
            graphqlType = 'Bytes';
          }
      }

      schema += `  ${input.name}: ${graphqlType}!\n`;
    });

    schema += `}\n\n`;
  });

  // Generate AssemblyScript mappings template
  let mappings = `import { BigInt, Bytes } from "@graphprotocol/graph-ts"\n\n`;

  // Add imports for event types
  contractInfo.eventSignatures.forEach(event => {
    mappings += `import { ${event.name} as ${event.name}Event } from "../generated/Contract/${event.name}"\n`;
    mappings += `import { ${event.name} } from "../generated/schema"\n\n`;
  });

  // Add event handler functions
  contractInfo.eventSignatures.forEach(event => {
    mappings += `export function handle${event.name}(event: ${event.name}Event): void {\n`;
    mappings += `  let entity = new ${event.name}(event.transaction.hash.toHexString())\n\n`;

    mappings += `  entity.blockNumber = event.block.number\n`;
    mappings += `  entity.blockTimestamp = event.block.timestamp\n`;
    mappings += `  entity.transactionHash = event.transaction.hash\n\n`;

    event.inputs.forEach(input => {
      mappings += `  entity.${input.name} = event.params.${input.name}\n`;
    });

    mappings += `\n  entity.save()\n`;
    mappings += `}\n\n`;
  });

  return {
    schema,
    mappings,
  };
}

// Export functions
export { getContractInfo, getContractEvents, generateSubgraphTemplates };
