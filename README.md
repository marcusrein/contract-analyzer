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
  - Clear folder structure with date-based organization
  - Individual contract files separated for clarity
  - Event information with examples

## Installation

```bash
npm install -g cana
```

## Quick Start

1. Analyze a contract (two equivalent formats):
```bash
cana analyze 0xYourContractAddress
# or
cana -a 0xYourContractAddress
```

2. Add a new chain:
```bash
cana chains --add
```

3. Switch default chain:
```bash
cana chains --switch optimism
```

## Directory Structure

When analyzing a contract, Cana creates the following structure:
```
contracts-analyzed/
└── ContractName_chainName_YYYY-MM-DD/
    ├── abi.json              # Contract ABI
    ├── contract/            # Individual contract source files
    └── event-information.json # Event signatures and examples
```

## Commands

### Contract Analysis
```bash
# Basic analysis (two equivalent formats)
cana analyze <address>
cana -a <address>

# Analysis with specific chain
cana analyze <address> -c <chain>
cana -a <address> -c <chain>

# Analysis with custom block range
cana analyze <address> -b <block-range>
cana -a <address> -b <block-range>

# Force API key prompt
cana analyze <address> -d
cana -a <address> -d

# Summary view
cana analyze <address> -s
cana -a <address> -s
```

### Chain Management
```bash
# List available chains
cana chains

# Detailed chain information
cana chains list

# Add new chain
cana chains add

# Remove chain
cana chains remove <chain-id>

# Switch default chain
cana chains --switch <chain-id>
```

### Configuration
```bash
# Chain setup
cana setup
```

## Chain Configuration

Each chain requires:
- Chain identifier (e.g., ethereum, optimism)
- Network name
- Block explorer API URL
- Block explorer API key
- Chain ID (optional)

## API Keys

- API keys are stored securely in your global configuration
- Each chain can have its own explorer API key
- Keys can be updated using the `-d` flag during analysis

## Development

### Prerequisites

- Node.js v14 or higher
- npm v6 or higher

### Local Development
```bash
git clone <repository-url>
cd cana
npm install
npm link
```

## Error Handling

The CLI handles various error cases:
- Invalid API keys
- Network connectivity issues
- Rate limiting
- Block range limits
- Invalid URLs
- Missing configurations

## Contributing

Contributions are welcome! Please read our contributing guidelines for details.

## License

This project is licensed under the MIT License - see the LICENSE file for details.