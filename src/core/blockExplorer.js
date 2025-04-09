import fetch from 'node-fetch'; // Or use native fetch if Node >= 18
import { getApiKey } from '../utils/chains.js';

// Helper function to handle retries or rate limiting if needed later
async function fetchWithRetry(url, options, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        const data = await response.json();
        // Check for API-specific error messages
        if (data.status === '0' && data.message === 'NOTOK') {
          // Rate limit or other API error
          console.warn(`Block Explorer API Error: ${data.result}`);
          if (i === retries - 1) {
            throw new Error(`API Error: ${data.result}`);
          }
          await new Promise(res => setTimeout(res, delay * Math.pow(2, i))); // Exponential backoff
          continue;
        }
        if (data.message === 'OK' || data.status === '1') {
          return data.result;
        }
        // Handle unexpected API responses
        throw new Error(`Unexpected API response structure: ${JSON.stringify(data)}`);
      }
      if (response.status === 404) {
        // Not necessarily an error for all endpoints, but maybe for getAbi
        return null;
      }
      // Handle other HTTP errors
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    } catch (error) {
      console.error(`Fetch attempt ${i + 1} failed for ${url}: ${error.message}`);
      if (i === retries - 1) {
        throw error; // Rethrow last error
      }
      await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
    }
  }
  throw new Error('Max retries reached'); // Should not be reached if errors are rethrown
}


class BlockExplorerService {
  constructor() {
    // Potential future config: custom endpoints, retry settings
  }

  /**
   * Fetches the verified ABI of a contract from a block explorer API.
   * @param {string} address - The contract address.
   * @param {object} chain - The chain configuration object from chains.js.
   * @returns {Promise<string|null>} The ABI string if found and verified, otherwise null.
   */
  async getAbiFromExplorer(address, chain) {
    if (!chain?.explorerApiUrl) {
      console.warn(
        `Skipping ABI fetch: Block explorer API URL not configured for chain ${chain?.id || 'unknown'}.`,
      );
      return null;
    }

    const apiKey = await getApiKey(chain.id);
    if (!apiKey) {
      console.warn(
        `-- Skipping block explorer fallback for chain ${chain.id}: API key missing. ` +
        `Run 'cana setup' or set EXPLORER_API_KEY / EXPLORER_API_KEY_${chain.id} env var.`,
      );
      return null;
    }

    const url = new URL(chain.explorerApiUrl);
    url.searchParams.set('module', 'contract');
    url.searchParams.set('action', 'getabi');
    url.searchParams.set('address', address);
    url.searchParams.set('apikey', apiKey);

    try {
      console.log(`-- Fetching ABI from ${url.origin}...`);
      const abiString = await fetchWithRetry(url.toString());
      
      if (abiString && abiString !== 'Contract source code not verified') {
          // Basic validation: Does it look like a JSON array?
          if (abiString.trim().startsWith('[') && abiString.trim().endsWith(']')) {
              console.log('-- ABI retrieved successfully from block explorer.');
              return abiString;
          } else {
              console.warn(`-- Invalid ABI format received from block explorer for ${address}.`);
              return null;
          }
      } else {
        console.log('-- Contract not verified or ABI not available on block explorer.');
        return null;
      }
    } catch (error) {
      console.error(`❌ Failed to fetch ABI for ${address} from ${url.origin}: ${error.message}`);
      return null;
    }
  }

  /**
   * Attempts to find the contract creation transaction using block explorer APIs.
   * Note: This is heuristic and might not work for all contracts (e.g., proxies, factory deployments).
   * @param {string} address - The contract address.
   * @param {object} chain - The chain configuration object.
   * @returns {Promise<{txHash: string, blockNumber: number}|null>} Creation info or null.
   */
  async getContractCreationTx(address, chain) {
    if (!chain?.explorerApiUrl) {
        console.warn(`Skipping creation tx fetch: Explorer API URL not configured for chain ${chain?.id}.`);
        return null;
    }
    const apiKey = await getApiKey(chain.id);
    if (!apiKey) {
        console.warn(`Skipping creation tx fetch: API key missing for chain ${chain.id}.`);
        return null;
    }

    const url = new URL(chain.explorerApiUrl);
    // Etherscan-like API: get transaction list for the address
    // Some explorers might have a dedicated 'getcontractcreation' action, but txlist is more common
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', 'txlist'); // or 'txlistinternal' for some proxies?
    url.searchParams.set('address', address);
    url.searchParams.set('page', '1');
    url.searchParams.set('offset', '1'); // Get the first transaction
    url.searchParams.set('sort', 'asc'); // Sort by oldest first
    url.searchParams.set('apikey', apiKey);

    try {
        console.log(`-- Fetching transaction list from ${url.origin} to find creation tx...`);
        const transactions = await fetchWithRetry(url.toString());

        if (transactions && Array.isArray(transactions) && transactions.length > 0) {
            const firstTx = transactions[0];
            // Heuristic: Check if the first transaction *to* this address looks like a creation
            // More reliable check is often if tx.to is null/empty, but txlist might not show that directly.
            // We assume the first transaction involving the address is the creation/initialization.
            // This IS NOT PERFECT and fails for factory patterns, proxies created by other contracts etc.
            if (firstTx.to?.toLowerCase() === address.toLowerCase() || firstTx.contractAddress?.toLowerCase() === address.toLowerCase()) {
                 console.log(`-- Found potential creation transaction: ${firstTx.hash}`);
                 return {
                    txHash: firstTx.hash,
                    blockNumber: parseInt(firstTx.blockNumber, 10),
                 };
            }
             console.log('-- First transaction found does not appear to be contract creation.');
             return null;
        } else {
            console.log('-- No transactions found for address via block explorer.');
            return null;
        }
    } catch (error) {
        console.error(`❌ Failed to fetch creation tx for ${address} from ${url.origin}: ${error.message}`);
        return null;
    }
  }

  /**
   * Fetches verified source code from a block explorer API.
   * Handles different response formats (single file, multi-file JSON).
   * @param {string} address - The contract address.
   * @param {object} chain - The chain configuration object.
   * @returns {Promise<object|null>} An object mapping filenames to source code content, or null.
   * Example: { "Contract.sol": "...", "Lib.sol": "..." } or { "SourceCode": "..." }
   */
  async getSourceCodeFromExplorer(address, chain) {
    if (!chain?.explorerApiUrl) {
      console.warn(`Skipping source code fetch: Explorer API URL not configured for chain ${chain?.id}.`);
      return null;
    }
    const apiKey = await getApiKey(chain.id);
    if (!apiKey) {
      console.warn(`Skipping source code fetch: API key missing for chain ${chain.id}.`);
      return null;
    }

    const url = new URL(chain.explorerApiUrl);
    url.searchParams.set('module', 'contract');
    url.searchParams.set('action', 'getsourcecode');
    url.searchParams.set('address', address);
    url.searchParams.set('apikey', apiKey);

    try {
      console.log(`-- Fetching source code from ${url.origin}...`);
      const results = await fetchWithRetry(url.toString());

      if (!results || !Array.isArray(results) || results.length === 0) {
        console.log('-- No source code information returned by explorer API.');
        return null;
      }

      const sourceInfo = results[0];
      if (!sourceInfo.SourceCode || sourceInfo.SourceCode === '') {
        console.log('-- Contract source code not verified on block explorer.');
        return null;
      }

      if (sourceInfo.SourceCode.startsWith('{') && sourceInfo.SourceCode.endsWith('}')) {
        try {
          let jsonData = JSON.parse(sourceInfo.SourceCode);
          if (typeof jsonData === 'string') {
            jsonData = JSON.parse(jsonData);
          }

          if (jsonData.sources) {
            console.log('-- Multi-file source code structure found (standard).');
            const sources = {};
            for (const path in jsonData.sources) {
              sources[path] = jsonData.sources[path].content;
            }
            return sources;
          } else if (jsonData.language === 'Solidity') {
            console.log('-- Multi-file source code structure found (Truffle/Hardhat style).');
            return jsonData.sources;
          } else {
            console.log('-- Multi-file source code structure found (simple JSON).');
            return jsonData;
          }
        } catch (e) {
          console.warn(`-- Could not parse JSON source code structure: ${e.message}. Treating as single file.`);
          return { [`${sourceInfo.ContractName || 'Contract'}.sol`]: sourceInfo.SourceCode };
        }
      } else {
        console.log('-- Single source file found.');
        return { [`${sourceInfo.ContractName || 'Contract'}.sol`]: sourceInfo.SourceCode };
      }
    } catch (error) {
      console.error(`❌ Failed to fetch source code for ${address} from ${url.origin}: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetches event logs from a block explorer API.
   * @param {string} address - Contract address.
   * @param {object} chain - Chain configuration.
   * @param {number} [fromBlock=0] - Starting block number.
   * @param {string} [toBlock='latest'] - Ending block number.
   * @param {string[]} [topics] - Array of topics to filter by (topic0, topic1, ...).
   * @param {number} [limit=1000] - Max number of logs (API dependent).
   * @returns {Promise<object[]|null>} Array of log objects or null on error.
   */
  async getLogs(address, chain, fromBlock = 0, toBlock = 'latest', topics = [], limit = 1000) {
      if (!chain?.explorerApiUrl) {
        console.warn(`Skipping log fetch: Explorer API URL not configured for chain ${chain?.id}.`);
        return null;
      }
      const apiKey = await getApiKey(chain.id);
      if (!apiKey) {
        console.warn(`Skipping log fetch: API key missing for chain ${chain.id}.`);
        return null;
      }
      
      // Blockscout uses POST for getLogs, Etherscan uses GET
      // We'll default to GET (Etherscan style) for now
      // TODO: Add logic to detect explorer type or use POST if needed.
      const url = new URL(chain.explorerApiUrl);
      url.searchParams.set('module', 'logs'); // Often 'logs' or 'proxy' for eth_getLogs
      url.searchParams.set('action', 'getLogs');
      url.searchParams.set('address', address);
      url.searchParams.set('fromBlock', String(fromBlock));
      url.searchParams.set('toBlock', String(toBlock));
      url.searchParams.set('apikey', apiKey);
      
      // Add topics if provided
      topics.forEach((topic, index) => {
          if (topic) {
              // Ensure topics are hex-encoded and 0x prefixed
              const formattedTopic = topic.startsWith('0x') ? topic : `0x${topic}`;
              url.searchParams.set(`topic${index}`, formattedTopic);
              // Some APIs require topicX_topicY_opr for combinations (e.g., topic0_1_opr=and)
              // Keeping it simple for now.
          }
      });

      // Note: Etherscan has limits (e.g., 1000 results, block range limits)
      // We might need pagination logic for extensive searches.
      // url.searchParams.set('limit', String(limit)); // Some APIs might support this

      try {
          console.log(`-- Fetching event logs from ${url.origin}...`);
          const logs = await fetchWithRetry(url.toString());

          if (logs && Array.isArray(logs)) {
               console.log(`-- Found ${logs.length} event logs.`);
               return logs;
          } else {
              console.log('-- No logs found or invalid response from explorer API.');
              return []; // Return empty array if no logs found
          }
      } catch (error) {
          console.error(`❌ Failed to fetch logs for ${address} from ${url.origin}: ${error.message}`);
          return null;
      }
  }
}

export const blockExplorerService = new BlockExplorerService(); 