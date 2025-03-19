# Contract Analyzer CLI

A powerful command-line tool for analyzing smart contracts on Ethereum and other EVM-compatible blockchains.

## Features

- No traditional RPC endpoint required - just a block explorer API key
- Automatic contract analysis
- Deployment block detection
- Customizable block range for contract event history
- Detailed output of contract information
- Support for multiple EVM chains
- User-friendly command-line interface
- Analyze contract deployments and interactions
- Track contract events and transactions
- Contract verification status checking
- ABI analysis and validation
- Block number tracking and management
- Unique folder for each contract analysis (named with contract name, chain, and date)

## Installation

```bash
# Using npm
npm install -g contract-analyzer

# Using yarn
yarn global add contract-analyzer
```

## Quick Start

1. Install the CLI globally:
```bash
npm install -g contract-analyzer
```

2. Run the setup to configure your environment. Add blockscanner API key and blockscanner url endpoint during this setup. 
```bash
cana setup
```

4. Analyze any contract:
```bash
cana -a 0xContractAddress
```

## Usage

### Basic Commands

```bash
# Analyze a contract
cana -a <contract-address>

# List available chains
cana chains list

# Add a new chain
cana chains add

# Switch default chain
cana chains --switch <chain>

# Get help
cana --help
```

### Advanced Usage

```bash
# Analyze with specific chain
cana analyze -a <contract-address> -c <chain>

# Analyze with a specific block range
cana analyze -a <contract-address> -b 500

# Re-enter API keys (development mode)
cana analyze -a <contract-address> -d
```

## Configuration

The tool uses a secure configuration system that stores your settings in your home directory:

- API keys are stored in `~/.contract-analyzer/keys.json`
- Chain configurations are stored in `~/.contract-analyzer/chains.json`
- Default chain preference is stored in `~/.contract-analyzer/default_chain.txt`

This approach ensures your configurations persist across projects and API keys remain secure.

### API Keys

You'll need API keys from block explorers and the URL endpoint to analyze contracts. 
API keys are automatically saved when you:
1. Add a new chain with `cana chains add`
2. Run analysis with the `-d` flag: `cana analyze -a <address> -d`

### Setting Default Chain

You can set your default chain in several ways:

```bash
# Method 1: Use the dedicated switch command
cana chains --switch <chain>

# Method 2: Set when analyzing (automatically updates default)
cana analyze -a <address> -c <chain>
```

The default chain is used for all commands unless overridden with the `-c` flag.

### Analysis Output

Each contract analysis creates a unique folder in your current directory with the following naming convention:
```
ContractName_ChainName_YYYY-MM-DD
```

For example, analyzing the USDC contract on Ethereum might create:
```
USDC_ethereum_2023-06-15/
```

The folder contains:
- `abi.json` - The contract's ABI (if available)
- `contract.sol` - The contract's source code (if verified)
- `event-information.json` - Event signatures and examples

This ensures analyses of the same contract on different dates or chains don't overwrite each other.

## Development

### Prerequisites

- Node.js >= 16.0.0
- npm

### Setup Development Environment

1. Install dependencies:
```bash
npm install
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [ethers.js](https://docs.ethers.org/) for the Ethereum library
- [Commander.js](https://github.com/tj/commander.js) for the CLI framework
- All contributors and maintainers

## Support

For support, please open an issue in the GitHub repository or contact the maintainers.

## Analyzing Popular NFT Contracts

This tool has special optimizations for analyzing popular NFT contracts like CryptoPunks. These contracts may have specific event signatures and may require special handling due to their age or complexity.

### CryptoPunks

CryptoPunks is one of the oldest and most famous NFT collections on Ethereum. To analyze the CryptoPunks contract:

```bash
cana analyze 0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb
```

Note that CryptoPunks was deployed in June 2017 at block 3914495, before the ERC-721 standard was finalized. It uses a custom implementation with the following key events:

- `Assign(address,uint256)`: Used when a punk is assigned to an address
- `PunkTransfer(address,address,uint256)`: Used when a punk is transferred
- `PunkBought(uint256,uint256,address,address)`: Used when a punk is bought
- `PunkOffered(uint256,uint256,address)`: Used when a punk is offered for sale

The tool will automatically identify CryptoPunks and use the correct deployment block, saving you from scanning the entire blockchain history. The analysis results will be saved in a folder like `CryptoPunks_ethereum_YYYY-MM-DD`.

### Bored Ape Yacht Club

To analyze the Bored Ape Yacht Club contract:

```bash
cana analyze 0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d
```

This command will fetch the contract's deployment block, ABI, events, and generate analysis files in a folder like `Bored_Ape_Yacht_Club_ethereum_YYYY-MM-DD`. If you analyze the same contract on a different day or different chain, a new folder will be created, preserving previous analyses.