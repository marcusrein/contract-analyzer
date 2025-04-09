# Changelog

## [1.3.0] - 2024-04-09

### Added

- Added explicit saving of the `combinedAbi` to `combined.abi.json` in the output directory when analyzing proxy contracts.
- Added more informative logging when combined ABI generation fails (e.g., due to implementation fetch failure).

### Fixed

- Significantly increased delays before/during block explorer API calls (implementation fetch, event fetching) to mitigate rate limiting issues.
- Fixed `Failed to parse URL` error caused by incorrect argument passing to `getDeploymentBlock` after parameter removal.
- Removed unused `blockRange` parameter from `getDeploymentBlock` function.

## [1.2.1] - 2024-04-09

### Fixed

- Improved API error handling and logging for various block explorer calls (source fetch, creation check, latest block, events) to provide clearer diagnostics on failures (e.g., `NOTOK` messages, rate limits).
- Corrected the check for the `eth_blockNumber` API response format to handle standard JSON-RPC structure.
- Fixed incorrect generation of block explorer links in the output table.

## [1.2.0] - 2024-04-09

### Added

- **Combined ABI Generation:** When analyzing a proxy contract (`cana analyze <address>`), if the implementation contract is also verified on the block explorer, the tool now automatically fetches both ABIs, merges them, and saves the result to `contracts-analyzed/<chain>/<proxy_address>/Combined.abi.json`.

### Fixed

- Resolved issue where combined ABI was saved even if implementation fetch failed.
- Fixed bug causing incorrect "contract not verified" warnings to display for verified contracts.
- Corrected various code style and linting issues identified by Prettier/ESLint.

## [1.1.7] - 2024-03-25

### Added

- Fixed global `-a/--address` shorthand option to properly invoke the analyze command
- Both `cana -a <address>` and `cana analyze <address>` now work identically

## [1.1.6] - 2024-03-25

### Added

- Improved version detection with more reliable fallback mechanism

### Changed

- Initial setup now creates a true blank slate with no pre-configured chains
- Setup process simplified with clearer configuration messages
- Removed duplicate configuration file location display

## [1.1.3-1.1.5] - 2024-03-25

### Fixed

- `cana setup` now runs properly

### Improved

- Enhanced setup command to display configuration file location more prominently

## [1.1.1 and 1.1.2] - 2024-03-22

### Fixed

- Improved cli cuing for user
- Removed unnecessary console logs from contract analysis output
- Cleaned up file output messaging for unverified contracts

## [1.1.0] - 2024-03-22

### Added

- Proxy and Implementation smart contracts analysis added
- Improved logging for contract analysis
- Handling of unverified contracts

### Changed

- Analysis output now saved to `contracts-analyzed/<chain>/<contract_name_or_address>/`.

## [1.0.6] - 2024-03-21

### Added

- Improved error messages for invalid API keys

### Fixed

- Chain switching reliability issues
- Fixed parsing of proxy contract information
- Better handling of API errors from block explorers

## [1.0.1-1.0.5] - 2024-03-15

### Fixed

- `cana setup` errors

## [1.0.0] - 2024-03-21

- Initial release.
- Core contract analysis features (deployment block, verification status, ABI, source code).
- Basic proxy detection.
- Event analysis.
- Saves output to `contracts-analyzed/`.
