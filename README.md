# Cana - Smart Contract Analysis CLI

A powerful command-line tool for analyzing smart contracts on Ethereum and other EVM-compatible blockchains.

## Verification Process

Cana uses a two-step process to get contract information:

1.  **Sourcify:** It first checks the [Sourcify](https://sourcify.dev/) repository, a decentralized and open-source contract verification service. If a contract has a **full** or **partial** match on Sourcify, Cana retrieves the verified metadata and ABI directly from there. This is the preferred method and **does not require any API keys**. Metadata is saved to `contracts-analyzed/<chain-id>/<address>/metadata.json`.

2.  **Block Explorer Fallback:** If the contract is **not found** on Sourcify, Cana attempts to fetch the ABI from the block explorer configured for the target chain (e.g., Etherscan, Polygonscan). This fallback mechanism **requires a block explorer API key** to function reliably and avoid rate limits. The ABI (if found) is saved to `contracts-analyzed/<chain-id>/<address>/abi.json`.

Therefore, while the tool can function for Sourcify-verified contracts without setup, running `cana setup` is **highly recommended** to enable the block explorer fallback for broader contract compatibility.

## Installation

```bash
# Clone the repository (if not done already)
# git clone https://github.com/marcusrein/contract-analyzer.git
# cd contract-analyzer

# Install dependencies
npm install

# Link the binary for global use
npm link
```

## Quick Start

1.  **(Recommended) Configure API Keys:**
    ```bash
    cana setup
    ```
    This interactive prompt helps you store API keys for the block explorer fallback for each configured chain (defined in `config/chains.json`).

2.  **Analyze a Contract:**
    ```bash
    # Analyze using the default chain (set in config/chains.json)
    cana analyze 0xYourContractAddress

    # Analyze on a specific chain
    cana analyze 0xAnotherContractAddress -c <chainId>
    ```
    Results (metadata or ABI) are saved in the `contracts-analyzed/` directory.

3.  **Manage Chains:**
    ```bash
    # List configured chains
    cana chains list

    # Set the default chain
    cana chains set <chainId>

    # Add a new chain interactively
    cana chains add

    # Remove a chain
    cana chains remove <chainId>
    ```

## Directory Structure

Analysis results are saved in:
```
contracts-analyzed/
└── <chainId>/
    └── <contractAddress>/
        ├── analysis_summary.json # Details about the verification outcome (source, status)
        ├── metadata.json         # (If found on Sourcify)
        └── abi.json              # (If ABI found via Sourcify or Block Explorer fallback)
```

## Commands

*   `cana analyze <address> [options]`
    *   `-c, --chain <chainId>`: Specify target chain ID.
*   `cana chains list|ls`
*   `cana chains set <chainId>`
*   `cana chains add`
*   `cana chains remove|rm <chainId>`
*   `cana setup`
*   `cana --help`
*   `cana <command> --help`

## Configuration

Chain details and API keys are stored in `config/chains.json`. You can edit this file directly or use the `cana chains` and `cana setup` commands.

## Prerequisites

- Node.js v18 or higher (due to native fetch usage, or ensure `node-fetch` is installed)
- npm

## Contributing

Contributions are welcome! Please read our contributing guidelines for details.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
