/**
 * ContractInfo - A utility to fetch contract verification status, ABI, and source code
 * 
 * This module provides functionality to retrieve contract information from Etherscan
 * and similar block explorers for EVM-compatible chains.
 */
import { ethers } from "ethers";

/**
 * Get contract verification status and ABI from block explorer
 * 
 * @param {string} rpcUrl - The RPC URL for the blockchain network
 * @param {string} contractAddress - The address of the contract to check
 * @param {string} explorerApiKey - API key for the block explorer
 * @param {string} [blockExplorerUrl='https://api.etherscan.io/api'] - Block explorer API URL
 * @returns {Promise<Object>} Object containing verification status, ABI, and source code
 */
async function getContractInfo(rpcUrl, contractAddress, explorerApiKey, blockExplorerUrl = 'https://api.etherscan.io/api') {
    try {
        // Validate input parameters
        if (!rpcUrl || typeof rpcUrl !== 'string') {
            throw new Error('API_KEY_ERROR: Invalid RPC URL provided');
        }
        
        if (!contractAddress || typeof contractAddress !== 'string' || !ethers.isAddress(contractAddress)) {
            throw new Error('VALIDATION_ERROR: Invalid contract address provided');
        }

        if (!explorerApiKey) {
            throw new Error('API_KEY_ERROR: Block explorer API key is required');
        }
        
        if (explorerApiKey.includes('your-') || explorerApiKey === 'your-key') {
            throw new Error('API_KEY_ERROR: Block explorer API key contains placeholder text');
        }

        // Fetch contract source code and ABI
        let response;
        try {
            response = await fetch(
                `${blockExplorerUrl}?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${explorerApiKey}`
            );
        } catch (fetchError) {
            throw new Error(`NETWORK_ERROR: Failed to connect to block explorer API: ${fetchError.message}. Please check your internet connection.`);
        }
        
        if (!response.ok) {
            throw new Error(`NETWORK_ERROR: Block explorer API returned status ${response.status}: ${response.statusText}`);
        }
        
        let data;
        try {
            data = await response.json();
        } catch (jsonError) {
            throw new Error(`NETWORK_ERROR: Failed to parse response from block explorer: ${jsonError.message}`);
        }
        
        if (data.status !== '1') {
            // Check for API key related errors
            if (data.message?.includes('Invalid API Key') || data.message?.includes('rate limit')) {
                throw new Error(`API_KEY_ERROR: Block explorer API key error: ${data.message}`);
            }
            throw new Error(`EXPLORER_ERROR: Failed to fetch contract info: ${data.message || 'Unknown error'}`);
        }

        const contractInfo = data.result[0];
        
        // Check if contract is verified
        const isVerified = contractInfo.ABI !== '[]' && contractInfo.ABI !== 'Contract source code not verified';
        
        // Parse ABI and extract event information
        let abi = null;
        let eventSignatures = [];
        
        if (isVerified) {
            try {
                abi = JSON.parse(contractInfo.ABI);
                
                // Extract event information from ABI
                eventSignatures = extractEventSignatures(abi);
            } catch (abiError) {
                console.warn(`Warning: Could not parse ABI: ${abiError.message}`);
            }
        }
        
        // Build contract info object with everything from the response
        const result = {
            isVerified,
            abi,
            sourceCode: isVerified ? contractInfo.SourceCode : null,
            compilerVersion: contractInfo.CompilerVersion,
            optimizationUsed: contractInfo.OptimizationUsed,
            runs: contractInfo.Runs,
            constructorArguments: contractInfo.ConstructorArguments,
            licenseType: contractInfo.LicenseType,
            proxy: contractInfo.Proxy === '1',
            implementation: contractInfo.Implementation,
            swarmSource: contractInfo.SwarmSource,
            eventSignatures,
            // Add a function to generate subgraph templates
            generateSubgraphTemplates: () => generateSubgraphTemplates({ 
                abi, 
                eventSignatures,
                isVerified
            })
        };
        
        return result;
    } catch (error) {
        console.error('Error fetching contract info:', error.message);
        // Rethrow API key errors so they can be handled by the main script
        if (error.message.includes('API_KEY_ERROR')) {
            throw error;
        }
        return null;
    }
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
                indexed: input.indexed || false
            })),
            anonymous: event.anonymous || false
        };
    });
}

/**
 * Get all events emitted by a contract
 * 
 * @param {string} rpcUrl - The RPC URL for the blockchain network
 * @param {string} contractAddress - The address of the contract to check
 * @param {number} fromBlock - Starting block number
 * @param {number} toBlock - Ending block number
 * @returns {Promise<Object>} Object containing event metadata
 */
async function getContractEvents(rpcUrl, contractAddress, fromBlock, toBlock) {
    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        
        // Get all events for the contract
        const filter = {
            address: contractAddress,
            fromBlock: fromBlock,
            toBlock: Math.min(fromBlock + 1000, toBlock) // Only get a sample of events
        };

        let logs;
        try {
            logs = await provider.getLogs(filter);
        } catch (logsError) {
            // If we get an error for too large a range, try with a smaller range
            if (logsError.message.includes('log limit') || logsError.message.includes('block range')) {
                console.log('Warning: Block range too large for events, reducing sample size...');
                // Try with a much smaller range
                const newFilter = {
                    address: contractAddress,
                    fromBlock: fromBlock,
                    toBlock: Math.min(fromBlock + 100, toBlock)
                };
                logs = await provider.getLogs(newFilter);
            } else {
                throw new Error(`NETWORK_ERROR: Failed to get logs: ${logsError.message}`);
            }
        }
        
        // Group events by event signature (topic0)
        const events = {};
        for (const log of logs) {
            const eventSignature = log.topics[0];
            if (!events[eventSignature]) {
                events[eventSignature] = {
                    count: 0,
                    signature: eventSignature,
                    firstBlock: log.blockNumber,
                    sample: {
                        blockNumber: log.blockNumber,
                        transactionHash: log.transactionHash,
                        topics: log.topics
                    }
                };
            }
            events[eventSignature].count++;
        }

        return Object.values(events);
    } catch (error) {
        console.error('Error fetching contract events:', error.message);
        // Rethrow network errors so they can be handled by the main script
        if (error.message.includes('NETWORK_ERROR')) {
            throw error;
        }
        return null;
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
    let schema = "type _Schema_\n\n";
    
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
        mappings
    };
}

// Export functions
export { getContractInfo, getContractEvents, generateSubgraphTemplates }; 