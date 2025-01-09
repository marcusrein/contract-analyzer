import { ethers } from "ethers";

async function getDeploymentBlock(rpcUrl, contractAddress) {
	try {
		const provider = new ethers.JsonRpcProvider(rpcUrl);

		// Define the block range size
		const blockRangeSize = 10000;
		let fromBlock = 0;
		let latestBlock = await provider.getBlockNumber();

		while (fromBlock <= latestBlock) {
			const toBlock = Math.min(fromBlock + blockRangeSize, latestBlock);

			// Filter for the contract creation event
			const filter = {
				address: contractAddress,
				fromBlock,
				toBlock,
			};

			const logs = await provider.getLogs(filter);

			if (logs.length > 0) {
				// The first log entry should correspond to the contract creation
				const deploymentBlock = logs[0].blockNumber;
				console.log(`Contract deployed at block number: ${deploymentBlock}`);
				return;
			}

			fromBlock = toBlock + 1;
		}

		console.log("No deployment transaction found for this contract address.");
	} catch (error) {
		console.error("An error occurred:", error.message);
	}
}

// Use the new Infura RPC URL for Base mainnet
const rpcUrl =
	"https://base-mainnet.infura.io/v3/4e338994a5c2486988b490c29e9dc69f";
const contractAddress = "0x227f65131A261548b057215bB1D5Ab2997964C7d";

getDeploymentBlock(rpcUrl, contractAddress);
