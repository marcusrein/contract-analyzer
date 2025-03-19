/**
 * GetStartBlock - A utility to find the deployment block of a smart contract
 * 
 * This module provides functionality to determine when a contract was deployed
 * on Ethereum or any EVM-compatible blockchain by searching through block ranges.
 */
import { ethers } from "ethers";
import { getContractInfo, getContractEvents } from './contractInfo.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Find the block number where a contract was deployed and gather contract information
 * 
 * @param {string} rpcUrl - The RPC URL for the blockchain network
 * @param {string} contractAddress - The address of the contract to check
 * @param {string} explorerApiKey - API key for Etherscan or similar block explorer
 * @param {number} [blockRangeSize=10000] - Size of block ranges to scan (optional)
 * @param {string} [blockExplorerUrl='https://api.etherscan.io/api'] - Block explorer API URL
 * @returns {Promise<Object>} Object containing deployment block and contract information
 */
async function getDeploymentBlock(rpcUrl, contractAddress, explorerApiKey, blockRangeSize = 10000, blockExplorerUrl = 'https://api.etherscan.io/api') {
	try {
		// Validate input parameters
		if (!rpcUrl || typeof rpcUrl !== 'string') {
			throw new Error('API_KEY_ERROR: Invalid RPC URL provided. Please check your RPC endpoint.');
		}
		
		if (rpcUrl.includes('your-') || rpcUrl.includes('{key}')) {
			throw new Error('API_KEY_ERROR: Please provide a valid RPC URL. The URL contains placeholder text.');
		}
		
		if (!contractAddress || typeof contractAddress !== 'string' || !ethers.isAddress(contractAddress)) {
			throw new Error('VALIDATION_ERROR: Invalid contract address provided. Please ensure it is a valid Ethereum address.');
		}

		if (!explorerApiKey) {
			throw new Error('API_KEY_ERROR: Block explorer API key is required. Please provide a valid API key.');
		}
		
		if (explorerApiKey.includes('your-') || explorerApiKey === 'your-key') {
			throw new Error('API_KEY_ERROR: Please provide a valid block explorer API key. The key contains placeholder text.');
		}

		console.log(`Searching for deployment block of contract: ${contractAddress}`);
		console.log(`Using RPC endpoint: ${rpcUrl}`);
		console.log(`Using block explorer: ${blockExplorerUrl}`);
		
		// Initialize provider connection
		const provider = new ethers.JsonRpcProvider(rpcUrl);
		
		try {
			// Test RPC connection
			await provider.getNetwork();
		} catch (networkError) {
			throw new Error(`NETWORK_ERROR: Failed to connect to RPC provider: ${networkError.message}. Please check your RPC URL and network connection.`);
		}

		// Get current block height
		let latestBlock;
		try {
			latestBlock = await provider.getBlockNumber();
			console.log(`Latest block: ${latestBlock}`);
			console.log(`Scanning in ranges of ${blockRangeSize} blocks...`);
		} catch (blockError) {
			throw new Error(`NETWORK_ERROR: Failed to get latest block: ${blockError.message}. This may indicate RPC rate limiting or network issues.`);
		}
		
		let fromBlock = 0;
		// Iterate through block ranges
		while (fromBlock <= latestBlock) {
			const toBlock = Math.min(fromBlock + blockRangeSize, latestBlock);
			
			console.log(`Scanning blocks ${fromBlock} to ${toBlock}...`);

			// Filter for any logs involving this contract address
			const filter = {
				address: contractAddress,
				fromBlock,
				toBlock,
			};

			let logs;
			try {
				logs = await provider.getLogs(filter);
			} catch (logsError) {
				// If we get an error for too large a range, try with a smaller range
				if (logsError.message.includes('log limit') || logsError.message.includes('block range')) {
					const newBlockRange = Math.floor(blockRangeSize / 2);
					console.log(`Block range too large, reducing to ${newBlockRange}...`);
					fromBlock = toBlock - newBlockRange;
					continue;
				}
				throw new Error(`NETWORK_ERROR: Failed to get logs: ${logsError.message}. This may indicate RPC limitations.`);
			}

			if (logs.length > 0) {
				// The first log entry should correspond to the earliest interaction
				const deploymentBlock = logs[0].blockNumber;
				console.log(`Contract deployed at block number: ${deploymentBlock}`);

				// Get contract information
				console.log('Fetching contract information...');
				let contractInfo;
				try {
					contractInfo = await getContractInfo(rpcUrl, contractAddress, explorerApiKey, blockExplorerUrl);
					if (!contractInfo) {
						console.log('WARNING: Could not retrieve contract information. The block explorer API may be unavailable or rate limited.');
					}
				} catch (contractError) {
					console.error(`Error fetching contract info: ${contractError.message}`);
					if (contractError.message.includes('API key')) {
						throw new Error(`API_KEY_ERROR: Invalid block explorer API key. Please check your API key for the selected network.`);
					}
				}

				// Get events from deployment block to latest block
				console.log('Fetching contract events...');
				let events;
				try {
					events = await getContractEvents(rpcUrl, contractAddress, deploymentBlock, latestBlock);
				} catch (eventsError) {
					console.error(`Error fetching events: ${eventsError.message}`);
				}

				// Create output directory if it doesn't exist
				const outputDir = path.join(process.cwd(), 'contract-info');
				await fs.mkdir(outputDir, { recursive: true });

				// Save ABI to file if available
				if (contractInfo?.abi) {
					await fs.writeFile(
						path.join(outputDir, 'abi.json'),
						JSON.stringify(contractInfo.abi, null, 2)
					);
					console.log('ABI saved to contract-info/abi.json');
				}

				// Save source code to file if available
				if (contractInfo?.sourceCode) {
					await fs.writeFile(
						path.join(outputDir, 'contract.sol'),
						contractInfo.sourceCode
					);
					console.log('Source code saved to contract-info/contract.sol');
				}

				// Save events to file
				if (events) {
					await fs.writeFile(
						path.join(outputDir, 'events.json'),
						JSON.stringify(events, null, 2)
					);
					console.log('Events saved to contract-info/events.json');
				}

				return {
					deploymentBlock,
					contractInfo,
					events
				};
			}

			fromBlock = toBlock + 1;
		}

		console.log("No deployment transaction found for this contract address.");
		return null;
	} catch (error) {
		console.error("\n❌ ERROR: " + error.message);
		
		// Handle specific error types with helpful messages
		if (error.message.includes('API_KEY_ERROR')) {
			console.error("\n📝 API Key Issue:");
			console.error("  Please check your API keys in the .env file or when prompted.");
			console.error("  Run the command with the -d flag to re-enter your API keys:");
			console.error("  npm run analyze -- -a 0xYourContractAddress -d");
		} else if (error.message.includes('NETWORK_ERROR')) {
			console.error("\n🌐 Network Issue:");
			console.error("  There appears to be a problem connecting to the blockchain or API.");
			console.error("  - Check your internet connection");
			console.error("  - Verify your API keys have proper permissions");
			console.error("  - The RPC provider might be experiencing issues or rate limiting");
		}
		
		return null;
	}
}

// Default execution when run directly
if (import.meta.url === import.meta.main) {
	// Use the Infura RPC URL for Base mainnet
	const rpcUrl =
		"https://base-mainnet.infura.io/v3/4e338994a5c2486988b490c29e9dc69f";
	const contractAddress = "0x227f65131A261548b057215bB1D5Ab2997964C7d";
	const explorerApiKey = process.env.ETHERSCAN_API_KEY;

	if (!explorerApiKey) {
		console.error('Please set the ETHERSCAN_API_KEY environment variable');
		process.exit(1);
	}

	getDeploymentBlock(rpcUrl, contractAddress, explorerApiKey);
}

// Export the function for use as a module
export { getDeploymentBlock };
