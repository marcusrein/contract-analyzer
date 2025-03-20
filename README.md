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
  - Built-in support for Ethereum
  - Easy addition of custom EVM-compatible chains
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

1. Chain Setup
```bash
cana setup
```
Add in Blockscanner API key and API URL endpoint into setup. The chain added will now be the `default` chain for all subsequent contract analysis. 

2. Analyze a contract.
```bash
cana analyze 0xYourContractAddress
# or
cana -a 0xYourContractAddress
```

3. Add another chain:
```bash
cana setup
```

4. List all added chains:
```bash
cana chains
```

5. Switch default chain:
```bash
cana chains --switch `chain name` 
```

Now that the default chain is switched, all subsequent analysis will be on this new default chain.

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

# Summary view
cana analyze <address> -s
cana -a <address> -s
```

## Chain Configuration

Chain configurations are stored in `~/.contract-analyzer/config.json`. This file contains:

- List of configured chains and their details
- Default chain selection
- API keys for block explorers

### Prerequisites

- Node.js v16 or higher
- npm v6 or higher

## Contributing

Contributions are welcome! Please read our contributing guidelines for details.

## License

This project is licensed under the MIT License - see the LICENSE file for details.