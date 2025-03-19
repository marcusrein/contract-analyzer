# Contract Analyzer

A utility to analyze smart contracts on Ethereum and other EVM-compatible blockchains.

## Description

Contract Analyzer helps blockchain developers and researchers by providing comprehensive information about smart contracts:

- Find the exact block number when a contract was deployed
- Check contract verification status
- Retrieve contract ABI and source code (if verified)
- Get all events emitted by the contract
- Generate subgraph templates for verified contracts

The tool is designed to work with Ethereum by default, but can be configured to support any EVM-compatible blockchain.

## Quick Start for Ethereum Development

```bash
# Clone the repository
git clone https://github.com/yourusername/contract-analyzer.git
cd contract-analyzer

# Install dependencies
npm install

# Run the setup script (creates .env file, makes scripts executable)
npm run setup

# Test with the default contract (WETH)
npm run dev

# Analyze a specific Ethereum contract
npm run dev 0xYourContractAddress

# Or use the CLI directly
npm run analyze -- -a 0xYourContractAddress
```

## Setup & Configuration

### Required API Keys

This tool requires:
1. **Etherscan API Key** to fetch contract verification info
2. **Alchemy API Key** (or other RPC provider) for blockchain interaction

You can provide these during the setup process or by editing the `.env` file directly.

### Environment File (.env)

The `.env` file contains your configuration:

```env
# RPC URL for Ethereum (default)
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your-alchemy-api-key

# Etherscan API key
ETHERSCAN_API_KEY=your-etherscan-api-key

# Selected blockchain network (defaults to ethereum)
SELECTED_CHAIN=ethereum
```

## Using the CLI

### Analyzing Ethereum Contracts

```bash
# Basic usage
npm run analyze -- -a 0xYourContractAddress

# With custom RPC URL and API key
npm run analyze -- -a 0xYourContractAddress -r https://eth-mainnet.provider.com -k YOUR_ETHERSCAN_API_KEY

# With custom block range size (defaults to 10000)
npm run analyze -- -a 0xYourContractAddress -b 5000

# Development mode (forces prompt for API keys)
npm run analyze -- -a 0xYourContractAddress -d
```

### Working with Other EVM Chains (Optional)

Contract Analyzer can be extended to work with any EVM-compatible blockchain. You'll need to add network configurations for chains you want to use:

```bash
# List all available networks
npm run networks:list

# Add a new network (interactive mode)
npm run networks:add

# Then analyze a contract on that network
npm run analyze -- -a 0xYourContractAddress -c polygon
```

#### Adding a New Network

When adding a new network, you'll need:

1. A network identifier (e.g., "polygon", "optimism")
2. An RPC URL (with optional {key} placeholder for API keys)
3. A block explorer API URL (must be Etherscan-compatible)
4. The name of the block explorer

Example for adding Polygon:
```
Network identifier: polygon
Network name: Polygon Mainnet
RPC URL: https://polygon-rpc.com
Block explorer API URL: https://api.polygonscan.com/api
Block explorer name: Polygonscan
Chain ID: 137
```

## Output Files

The tool creates a `contract-info` directory containing:

- `abi.json`: Contract ABI (if verified)
- `contract.sol`: Contract source code (if verified)
- `events.json`: All events emitted by the contract

## Using as a Module

```javascript
import { getDeploymentBlock } from './startBlock.js';

const rpcUrl = "https://eth-mainnet.provider.com";
const contractAddress = "0xYourContractAddressHere";
const etherscanApiKey = "YOUR_ETHERSCAN_API_KEY";
const blockRange = 10000;

const result = await getDeploymentBlock(
  rpcUrl, 
  contractAddress, 
  etherscanApiKey, 
  blockRange
);
console.log(result);
```

## Dependencies

- [ethers.js](https://github.com/ethers-io/ethers.js/) v6.13.5 - Ethereum library
- [commander](https://github.com/tj/commander.js) v11.1.0 - CLI framework
- [dotenv](https://github.com/motdotla/dotenv) v16.3.1 - Environment variable management
- [nanospinner](https://github.com/usmanyunusov/nanospinner) v1.1.0 - Terminal spinners

## License

[MIT](LICENSE)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request 