# Cana - Smart Contract Analysis CLI

A powerful command-line tool for analyzing smart contracts on Ethereum and other EVM-compatible blockchains.

## Features

- 🔍 **Contract Analysis**
  - Deployment block detection
  - Source code verification status
  - Contract ABI extraction
  - Event signature analysis
  - Proxy contract detection
  
- 🌐 **Multi-Chain Support**
  - Easy addition of any EVM-compatible chain
  - Chain configuration management
  - Default chain switching
  
- 📁 **Organized Output**
  - All analyzed contracts stored in `contracts-analyzed/` directory
  - Clear folder structure with contract name and chain
  - Individual contract files separated in contract/ directory
  - Event information with formatted examples

## Installation

```bash
# Install globally from npm
npm install -g contract-analyzer
```

## Quick Start

1. Initial Setup
```bash
cana setup
```
This initializes the configuration at `~/.contract-analyzer/config.json` and guides you through adding your first blockchain network.

2. Add Chain Details
When prompted, provide:
   - Chain name (e.g., "Ethereum Mainnet", "Base Sepolia")
   - Block explorer API key
   - Block explorer API endpoint URL
   - Block explorer name

3. Analyze a Contract
```bash
cana analyze 0xYourContractAddress
# or use the shorthand
cana -a 0xYourContractAddress
```

4. Add Additional Chains
```bash
cana setup
```
You can run setup anytime to add more chains.

5. List Configured Chains
```bash
cana chains list
```

6. Switch Active Chain
```bash
cana chains --switch <chain-name> 
# or use the shorthand
cana chains -s <chain-name>
```

All subsequent analysis commands will use the selected chain.

## Directory Structure

When analyzing a contract, Cana creates the following structure wherever you run the CLI:
```
contracts-analyzed/
└── ContractName_chainName_YYYY-MM-DD/
  ├── contract/            # Folder for individual contract files
  ├── abi.json              # Contract ABI
  └── event-information.json # Event signatures and examples
```

## Commands

### Contract Analysis
```bash
# Basic analysis
cana analyze <address>
cana -a <address>

# Analysis with specific chain
cana analyze <address> -c <chain>
cana -a <address> -c <chain>
```

## Chain Configuration

Chain configurations are stored in `~/.contract-analyzer/config.json`. This file contains:

- List of configured chains and their details
- Currently selected chain
- API keys for block explorers
- User preferences

### Prerequisites

- Node.js v16 or higher
- npm v6 or higher

## Contributing

Contributions are welcome! Please read our contributing guidelines for details.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
