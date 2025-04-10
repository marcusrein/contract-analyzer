#!/usr/bin/env node

import { Command } from 'commander';
import { config } from 'dotenv';
import { getDeploymentBlock } from './startBlock.js';
import readline from 'readline';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import {
  getChains,
  getChain,
  addChain,
  removeChain,
  setSelectedChain,
  getSelectedChain,
  saveApiKey,
} from './chains.js';
import { setup } from './setup.js';
import { existsSync } from 'fs';

// Get ES Module compatibility for __dirname and __filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
config();

// Get the version from package.json
let version = '1.0.4'; // Fallback version
try {
  const pkgPath = path.join(__dirname, '../package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
    version = pkg.version;
  } else {
    const localPkgPath = path.join(__dirname, './package.json');
    if (existsSync(localPkgPath)) {
      const localPkg = JSON.parse(await fs.readFile(localPkgPath, 'utf8'));
      version = localPkg.version;
    }
  }
} catch (error) {
  console.log('Warning: Could not read version from package.json:', error.message);
}

// Check if the global -a option was passed and convert it to 'analyze' command
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  // If we find -a or --address followed by an address, convert to analyze command
  if ((args[i] === '-a' || args[i] === '--address') && i + 1 < args.length) {
    // Replace the -a/--address with 'analyze'
    args[i] = 'analyze';
    // The rest of the arguments stay the same
    // Rewrite process.argv with the new command structure
    process.argv = process.argv.slice(0, 2).concat(args);
    break;
  }
}

// Create a single program instance
const program = new Command();

// Function to prompt for input
const prompt = query =>
  new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(query, answer => {
      rl.close();
      resolve(answer);
    });
  });

// Function to validate API keys before analysis
function validateApiKeys(explorerApiKey) {
  const errors = [];

  if (!explorerApiKey || explorerApiKey.includes('your-') || explorerApiKey === 'your-key') {
    errors.push('Invalid block explorer API key. It contains placeholder text or is missing.');
  }

  return errors;
}

// Function to save API keys using the unified config
async function saveApiKeys(chain, explorerKey) {
  try {
    // Get network configuration
    const networkConfig = await getChain(chain);
    if (!networkConfig) {
      throw new Error(`Network configuration not found for: ${chain}`);
    }

    // Save API key to unified config
    await saveApiKey(chain, explorerKey);

    console.log('\n✅ API key saved to global configuration');
    return true;
  } catch (error) {
    console.error(`\n❌ Error saving API key: ${error.message}`);
    return false;
  }
}

// Function to load API keys from unified config
async function loadApiKeys() {
  try {
    const chains = await getChains();
    const apiKeys = {};

    // Extract API keys from chain configurations
    for (const [id, chain] of Object.entries(chains)) {
      if (chain.apiKey) {
        apiKeys[`${id.toUpperCase()}_EXPLORER_KEY`] = chain.apiKey;
      }
    }

    return apiKeys;
  } catch (error) {
    console.error(`\n⚠️ Could not load API keys: ${error.message}`);
    return {};
  }
}

program
  .name('cana')
  .description(
    'Analyze smart contracts on Ethereum and other EVM-compatible blockchains.\n\nRun "cana setup" to set up new chains.'
  )
  .version(version)
  .option('-a, --address <address>', 'Shorthand to analyze the provided contract address');

// Add the setup command
program
  .command('setup')
  .description('Configure chain settings and API keys')
  .action(async () => {
    try {
      await setup();
    } catch (error) {
      console.error('Error during setup:', error.message);
    }
  });

// Function to update the selected chain in global config
async function updateSelectedChain(chain) {
  try {
    // Use the new setSelectedChain function from chains.js
    return await setSelectedChain(chain);
  } catch (error) {
    console.error(`\n⚠️ Could not update selected chain: ${error.message}`);
    return false;
  }
}

// Add a chains command to list all available chains
const chainsCommand = program.command('chains').description('Manage blockchain chains');

// Default chains command (simple list)
chainsCommand
  .action(async options => {
    try {
      // Check if we're switching chains
      if (options.switch) {
        const networks = await getChains();
        const chainId = options.switch.toLowerCase();

        // Validate chain selection
        if (!networks[chainId]) {
          console.error(`\n❌ Error: Unsupported chain "${chainId}"`);
          console.log('\nAvailable chains:');
          console.log(`- ethereum (selected)`);

          const otherNetworks = Object.keys(networks).filter(id => id !== 'ethereum');
          if (otherNetworks.length > 0) {
            otherNetworks.forEach(id => console.log(`- ${id}`));
          }

          process.exit(1);
        }

        // Update selected chain using unified config
        await setSelectedChain(chainId);

        // Show success message
        console.log(`\n✅ Selected chain switched to: ${chainId}`);
        console.log('\nThis will be used for all future commands unless overridden with -c flag');
        process.exit(0);
      }

      const networks = await getChains();

      console.log('\nAvailable Chains:');
      console.log('----------------');

      // Get current selected chain from global config
      const selectedChain = await getSelectedChain();

      // List all chains, marking the current selected
      Object.keys(networks)
        .sort((a, b) => {
          // Sort the chains but put the selected chain first
          if (a === selectedChain) {
            return -1;
          }
          if (b === selectedChain) {
            return 1;
          }
          return a.localeCompare(b);
        })
        .forEach(id => {
          if (id === selectedChain) {
            console.log(`${id} (selected)`);
          } else {
            console.log(id);
          }
        });

      console.log('\n:Analyze a smart contract on your selected chain with cana -a <address> ');
      console.log('For more details: cana chains list');
      console.log('To switch selected chain: cana chains -s <chain>');

      // Allow adding a new chain immediately
      if (options.add) {
        console.log('\nAdding a new chain...');

        const id = await prompt('Network identifier (e.g., optimism, base): ');
        const name = await prompt('Network name (e.g., Optimism Mainnet): ');

        console.log('\nBlock explorer API URL:');
        console.log('- For Etherscan-compatible explorers, use their API URL');
        console.log('  Example: "https://api.etherscan.io/api"');
        console.log('- IMPORTANT: This should be the URL of the API, not your API key');
        console.log('  You will be prompted separately for your API key\n');
        const explorer = await prompt('Block explorer API URL: ');

        // Add validation for the explorer URL
        if (!explorer.startsWith('http')) {
          console.log('\n⚠️  Warning: The provided value does not appear to be a valid URL');
          console.log('   URLs should start with http:// or https:// and not be an API key');
          console.log('   Example: https://api.etherscan.io/api for Ethereum\n');
          const confirm = await prompt('Do you still want to continue? (y/n): ');
          if (confirm.toLowerCase() !== 'y') {
            console.log('\nChain addition canceled. Please try again with a valid URL.');
            return;
          }
        }

        const explorerName = await prompt('Block explorer name (e.g., Etherscan, PolygonScan): ');

        const chainIdInput = await prompt('Chain ID (optional): ');
        const chainId = chainIdInput ? parseInt(chainIdInput, 10) : 0;

        // Add the network
        await addChain(id, {
          name,
          blockExplorer: explorer,
          blockExplorerName: explorerName,
          chainId,
        });

        // Prompt for API key
        console.log(`\n🔑 API Key for ${explorerName}`);
        console.log('---------------------');
        console.log(`You can get an API key from ${explorer.replace('/api', '')}`);
        const key = await prompt(`${explorerName} API Key: `);

        // Save the API key
        if (key) {
          await saveApiKeys(id, key);
        }

        console.log(
          `\n✅ Setup complete! You can now analyze smart contracts on ${id} with: 'cana -a <contract-address>'`
        );

        console.log('\n📘 To add support for other EVM chains:');
        console.log('   cana setup');

        console.log('\n🔍 To switch chains:');
        console.log('   cana chains -s <chain>');

        console.log('\n🔍 For a list of all chains use:');
        console.log('   cana chains list');
      } else {
        console.log('\nTo add a new chain:');
        console.log('  cana setup');
      }
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    }
  })
  .option('-s, --switch <chain>', 'Switch the selected chain');

// Detailed list command for chains
chainsCommand
  .command('list')
  .description('List all chains with detailed information')
  .action(async () => {
    try {
      const networks = await getChains();

      console.log('\nDetailed Chain Information:');
      console.log('-------------------------');

      // Get current selected chain from global config
      const selectedChain = await getSelectedChain();

      // List selected chain first
      if (networks[selectedChain]) {
        const config = networks[selectedChain];
        console.log(`\n${selectedChain} (selected):`);
        console.log(`  Name: ${config.name}`);
        console.log(`  Chain ID: ${config.chainId || 'N/A'}`);
        console.log(`  Block Explorer: ${config.blockExplorerName} (${config.blockExplorer})`);
      }

      // List other networks
      if (Object.keys(networks).length > 1) {
        console.log('\nAdditional Chains:');
        Object.entries(networks).forEach(([id, config]) => {
          if (id !== selectedChain) {
            console.log(`\n${id}:`);
            console.log(`  Name: ${config.name}`);
            console.log(`  Chain ID: ${config.chainId || 'N/A'}`);
            console.log(`  Block Explorer: ${config.blockExplorerName} (${config.blockExplorer})`);
          }
        });
      }

      console.log('\nTo add a new chain:');
      console.log('  cana setup');
    } catch (error) {
      console.error('\n❌ Error listing chains:', error.message);
      process.exit(1);
    }
  });

// Add chain command
chainsCommand
  .command('add')
  .description('Add a new EVM-compatible chain configuration')
  .option('-i, --id <id>', 'Chain identifier (e.g., optimism, polygon)')
  .option('-n, --name <n>', 'Chain name (e.g., Optimism Mainnet)')
  .option('-e, --explorer <url>', 'Block explorer API URL')
  .option('-x, --explorer-name <n>', 'Block explorer name (e.g., Etherscan, Optimism Explorer)')
  .option('-c, --chain-id <id>', 'Chain ID (optional)')
  .option('-k, --key <key>', 'Block explorer API key')
  .action(async options => {
    try {
      // If any required options are missing, prompt for them
      let { id, name, explorer, explorerName, chainId, key } = options;

      console.log('\n🔗 Add New EVM-Compatible Chain');
      console.log('--------------------------------');
      console.log('This will add a new chain to your local configuration.\n');

      if (!id) {
        id = await prompt('Chain identifier (e.g., optimism, base): ');
      }

      if (!name) {
        name = await prompt('Chain name (e.g., Optimism Mainnet): ');
      }

      if (!explorer) {
        console.log('\nBlock explorer API URL:');
        console.log('- For Etherscan-compatible explorers, use their API URL');
        console.log('  Example: "https://api.etherscan.io/api"');
        console.log('- IMPORTANT: This should be the URL of the API, not your API key');
        console.log('  You will be prompted separately for your API key\n');
        explorer = await prompt('Block explorer API URL: ');

        // Add validation for the explorer URL
        if (!explorer.startsWith('http')) {
          console.log('\n⚠️  Warning: The provided value does not appear to be a valid URL');
          console.log('   URLs should start with http:// or https:// and not be an API key');
          console.log('   Example: https://api.etherscan.io/api for Ethereum\n');
          const confirm = await prompt('Do you still want to continue? (y/n): ');
          if (confirm.toLowerCase() !== 'y') {
            console.log('\nChain addition canceled. Please try again with a valid URL.');
            return;
          }
        }
      }

      if (!explorerName) {
        explorerName = await prompt('Block explorer name (e.g., Etherscan, PolygonScan): ');
      }

      if (!chainId) {
        const chainIdInput = await prompt('Chain ID (optional): ');
        chainId = chainIdInput ? parseInt(chainIdInput, 10) : 0;
      } else {
        chainId = parseInt(chainId, 10);
      }

      // Add the network
      await addChain(id, {
        name,
        blockExplorer: explorer,
        blockExplorerName: explorerName,
        chainId,
      });

      // Prompt for API key if not provided
      if (!key) {
        console.log(`\n🔑 API Key for ${explorerName}`);
        console.log('---------------------');
        console.log(`You can get an API key from ${explorer.replace('/api', '')}`);
        key = await prompt(`${explorerName} API Key: `);
      }

      // Save the API key
      if (key) {
        await saveApiKeys(id, key);
      }

      console.log(`\n✅ Chain '${id}' added successfully!`);
      console.log('\n📝 Usage Example:');
      console.log(`cana analyze -a 0xYourContractAddress -c ${id}`);
    } catch (error) {
      console.error('\n❌ Error adding chain:', error.message);
      process.exit(1);
    }
  });

// Remove command
chainsCommand
  .command('remove')
  .description('Remove a custom chain configuration')
  .argument('<id>', 'Chain identifier to remove')
  .action(async id => {
    try {
      // Validate chain ID
      if (id.toLowerCase() === 'ethereum') {
        console.error('\n❌ Error: Cannot remove the selected Ethereum network.');
        console.log(
          'To modify Ethereum settings, edit your ~/.contract-analyzer/chains.json file directly.'
        );
        process.exit(1);
      }

      // Remove the network from the configuration
      await removeChain(id);

      // Also remove the API key from the global config
      try {
        const CONFIG_DIR = path.join(os.homedir(), '.contract-analyzer');
        const KEYS_FILE = path.join(CONFIG_DIR, 'keys.json');

        // Load existing keys
        let keys = {};
        try {
          const data = await fs.readFile(KEYS_FILE, 'utf8');
          keys = JSON.parse(data);

          // Remove the key for this chain
          delete keys[`${id.toUpperCase()}_EXPLORER_KEY`];

          // Save updated keys
          await fs.writeFile(KEYS_FILE, JSON.stringify(keys, null, 2));
          console.log(`\n✅ Removed API key for '${id}' from global configuration`);
        } catch (error) {
          // File doesn't exist, nothing to remove
        }
      } catch (error) {
        console.log(`\n⚠️ Warning: Could not remove API key: ${error.message}`);
      }

      console.log(`\n✅ Chain '${id}' removed successfully!`);
    } catch (error) {
      console.error(`\n❌ Error removing chain: ${error.message}`);
      process.exit(1);
    }
  });

// Define the analyze function that will be used for both the command and global option
async function analyzeContract(address, options = {}) {
  // Import chalk early to ensure it's available in error handling
  const chalk = await import('chalk').catch(() => {
    // If chalk is not installed, provide a basic implementation
    return {
      default: {
        green: text => text,
        yellow: text => text,
        blue: text => text,
        cyan: text => text,
        red: text => text,
        gray: text => text,
        bold: {
          green: text => text,
          yellow: text => text,
          blue: text => text,
          white: text => text,
        },
      },
    };
  });

  // Helper function to create a table-like display - defined early to ensure availability
  const createTable = (data, headers = null) => {
    // Find the longest string in each column
    const columnLengths = {};

    // Initialize with header lengths if provided
    if (headers) {
      Object.keys(headers).forEach(key => {
        columnLengths[key] = headers[key].length;
      });
    }

    // Check data lengths
    data.forEach(row => {
      Object.keys(row).forEach(key => {
        const valueLength = String(row[key]).length;
        columnLengths[key] = Math.max(columnLengths[key] || 0, valueLength);
      });
    });

    // Print headers if provided
    let output = '';
    if (headers) {
      Object.keys(headers).forEach(key => {
        output += chalk.default.bold.white(headers[key].padEnd(columnLengths[key] + 2));
      });
      output += '\n';
      Object.keys(headers).forEach(key => {
        output += '─'.repeat(columnLengths[key]) + '  ';
      });
      output += '\n';
    }

    // Print rows
    data.forEach(row => {
      Object.keys(row).forEach(key => {
        output += String(row[key]).padEnd(columnLengths[key] + 2);
      });
      output += '\n';
    });

    return output;
  };

  // Variables to be used in error handling
  let result;
  let chainConfig;

  try {
    // Get current selected chain
    const currentSelectedChain = await getSelectedChain();

    // Determine which chain to use (command line arg or selected)
    const chain = (options.chain || currentSelectedChain).toLowerCase();

    // If chain is not the current selected, update the selected
    if (chain !== currentSelectedChain) {
      await updateSelectedChain(chain);
    }

    // If chain is not ethereum, remind user they're using a non-selected chain
    if (chain !== 'ethereum') {
      console.log(`\n⚠️  Using chain: ${chain.toUpperCase()}`);
      console.log('   This is now your selected chain for future commands');
      console.log('   You can also use: cana chains -s <chain>');
    }

    // Get all available networks
    const networks = await getChains();

    // Validate chain selection
    if (!networks[chain]) {
      console.error(`\n❌ Error: Unsupported chain "${chain}"`);
      console.log('\nAvailable chains:');
      console.log(`- ethereum (selected)`);

      const otherNetworks = Object.keys(networks).filter(id => id !== 'ethereum');
      if (otherNetworks.length > 0) {
        otherNetworks.forEach(id => console.log(`- ${id}`));
      }

      console.log('\nTo add a new chain, run:');
      console.log('cana chains add');

      process.exit(1);
    }

    // Get the chain configuration
    chainConfig = networks[chain];
    const explorerKeyEnvName = `${chain.toUpperCase()}_EXPLORER_KEY`;

    // Load API keys from global config
    const apiKeys = await loadApiKeys();

    // Get or validate Explorer API key
    let explorerApiKey =
      options.key ||
      apiKeys[explorerKeyEnvName] ||
      process.env[explorerKeyEnvName] ||
      process.env.ETHERSCAN_API_KEY;

    // Validate API keys
    const keyErrors = validateApiKeys(explorerApiKey);

    // Check if keys are valid or dev mode is enabled
    const needsKeys = options.dev || keyErrors.length > 0;

    // If no API keys are provided or they're default values, prompt for them
    if (needsKeys) {
      console.log('\n🔑 API Key Required');
      console.log('-----------------');
      console.log(`Chain: ${chainConfig.name}`);
      console.log(`Block Explorer: ${chainConfig.blockExplorerName}`);

      if (keyErrors.length > 0) {
        console.log('\n⚠️  API Key Issues Detected:');
        keyErrors.forEach(err => console.log(`  - ${err}`));
      }

      console.log(`\nPlease enter your ${chainConfig.blockExplorerName} API key:`);
      console.log(`You can get one at ${chainConfig.blockExplorer.replace('/api', '')}`);
      explorerApiKey = await prompt(`${chainConfig.blockExplorerName} API Key: `);

      // Save the key to .env file
      const saved = await saveApiKeys(chain, explorerApiKey);

      if (!saved) {
        console.log(
          '\n⚠️  Could not save API key to .env file, but continuing with provided key...'
        );
      }
    }

    console.log('\n🔍 Starting contract analysis...');
    console.log(`Contract Address: ${address}`);
    console.log(`Network: ${chainConfig.name}`);
    console.log(`Block Explorer: ${chainConfig.blockExplorerName}`);

    result = await getDeploymentBlock(
      null,
      address,
      explorerApiKey,
      chainConfig.blockExplorer,
      chain,
    );

    if (!result) {
      console.error('\n❌ Analysis failed or no deployment found');
      console.log('\nTry running with the dev flag to re-enter API keys:');
      console.log(`cana analyze ${address} -d`);
      process.exit(1);
    }

    console.log('\n' + chalk.default.bold.green('✅ CONTRACT ANALYSIS COMPLETE') + '\n');

    // Contract Information Section
    console.log(chalk.default.bold.blue('📄 CONTRACT INFORMATION'));
    console.log('───────────────────────────────────');

    const contractInfoTable = [
      { property: 'Address', value: chalk.default.yellow(address) },
      {
        property: 'Name',
        value:
          result.contractInfo?.contractName ||
          (result.contractInfo?.isVerified === false ? '(Contract not verified)' : 'Unknown'),
      },
      { property: 'Network', value: chainConfig.name },
      {
        property: 'Deployment Block',
        value: result.deploymentBlock || 'Unknown',
      },
      {
        property: 'Verified',
        value: result.contractInfo?.isVerified
          ? chalk.default.green('Yes')
          : chalk.default.yellow('No'),
      },
      {
        property: 'Proxy',
        value: result.contractInfo?.proxy
          ? chalk.default.yellow('Yes')
          : result.contractInfo?.isVerified === false
            ? '(Verification required)'
            : 'No',
      },
    ];

    // Modified logic to display implementation information for proxies
    if (result.contractInfo?.proxy) {
      if (result.contractInfo.implementation && result.contractInfo.implementation !== '') {
        contractInfoTable.push({
          property: 'Implementation',
          value: result.contractInfo.implementation,
        });
      } else {
        contractInfoTable.push({
          property: 'Implementation',
          value: chalk.default.yellow('Unknown (proxy detected but implementation not found)'),
        });
      }
    }

    // Add a small separator before links section
    contractInfoTable.push({ property: '---', value: '---' });

    // Always add explorer links if possible - make them clickable with terminal formatting
    if (chainConfig.blockExplorer) {
      // Correctly derive base URL by removing /api if present
      const explorerBaseUrl = chainConfig.blockExplorer.endsWith('/api')
        ? chainConfig.blockExplorer.slice(0, -4)
        : chainConfig.blockExplorer;

      const explorerLink = `${explorerBaseUrl}/address/${address}`;
      contractInfoTable.push({
        property: 'Explorer Link',
        value: chalk.default.blue.underline(explorerLink),
      });

      // Add implementation link if this is a proxy contract
      if (
        result?.contractInfo?.proxy &&
        result.contractInfo.implementation &&
        result.contractInfo.implementation !== ''
      ) {
        // Use the same derived base URL
        const implementationLink = `${explorerBaseUrl}/address/${result.contractInfo.implementation}`;
        contractInfoTable.push({
          property: 'Implementation Link',
          value: chalk.default.blue.underline(implementationLink),
        });
      }
    }

    if (result.contractInfo?.sourceUrl && result.contractInfo.isVerified) {
      contractInfoTable.push({
        property: 'Source Code',
        value: chalk.default.blue.underline(result.contractInfo.sourceUrl),
      });
    } else if (result.contractInfo?.isVerified === false) {
      contractInfoTable.push({
        property: 'Source Code',
        value: '(Contract not verified)',
      });
    }

    console.log(createTable(contractInfoTable));

    // Save the combined ABI if it exists (for proxies)
    const combinedAbiPath = path.join(
      'contracts-analyzed',
      result.outputDir || 'contract-info',
      'Combined.abi.json'
    );
    if (
      result.contractInfo?.proxy &&
      result.contractInfo?.implementationVerified &&
      result.contractInfo?.combinedAbi
    ) {
      try {
        await fs.mkdir(path.dirname(combinedAbiPath), { recursive: true });
        await fs.writeFile(
          combinedAbiPath,
          JSON.stringify(result.contractInfo.combinedAbi, null, 2)
        );
        console.log(`\n✅ Combined ABI saved to: ${chalk.default.cyan(combinedAbiPath)}`);
      } catch (error) {
        console.warn(`\n⚠️ Could not save combined ABI: ${error.message}`);
      }
    }

    // Add a small separator after links section
    console.log('───────────');

    // Only show unverified warnings if the contract is actually not verified
    if (!result.contractInfo?.isVerified) {
      // Add additional note about verification
      console.log(
        chalk.default.yellow('⚠️ This contract is not verified. Limited data available.')
      );
      console.log(
        chalk.default.yellow(
          '   To access full contract details, verify the contract on the block explorer.'
        ),
      );
      console.log(
        chalk.default.yellow('   No data was saved to disk since the contract is unverified.')
      );
    }

    // Event Signature Section (even if unverified, we might have collected some information)
    if (result.contractInfo?.eventSignatures?.length > 0 || result.events?.length > 0) {
      console.log(chalk.default.bold.blue('📊 EVENT SIGNATURES'));
      console.log('─────────────────────');

      const eventSigTable = [];

      if (result.contractInfo?.eventSignatures?.length > 0) {
        result.contractInfo.eventSignatures.forEach(event => {
          eventSigTable.push({
            name: event.name || 'Unknown',
            signature: event.signature || '-',
            hash: event.signatureHash || '-',
          });
        });

        console.log(
          createTable(eventSigTable, { name: 'Event Name', signature: 'Signature', hash: 'Hash' })
        );
      } else {
        console.log(chalk.default.yellow('⚠️ No event signatures found or contract not verified.'));
        console.log(
          chalk.default.yellow(
            '   However, on-chain events have been collected to help with analysis.'
          ),
        );
      }
    }

    if (result.contractInfo?.isVerified) {
      console.log(
        '\n' + chalk.default.bold.green('Analysis finished. All data saved to disk.') + '\n'
      );
    } else {
      console.log(
        '\n' +
          chalk.default.bold.green(
            'Analysis finished. No data saved to disk for unverified contracts.'
          ) +
          '\n'
      );
    }
  } catch (error) {
    console.error(`\n❌ Error during analysis: ${error.message}`);

    // Handle special case for unverified contracts
    if (error.message.includes("Cannot read properties of null (reading 'abi')") && result) {
      // This is a special case for unverified contracts
      console.log('\n' + chalk.default.bold.green('✅ UNVERIFIED CONTRACT ANALYSIS') + '\n');

      // Contract Information Section - still show what we can
      console.log(chalk.default.bold.blue('📄 CONTRACT INFORMATION'));
      console.log('───────────────────────────────────');

      const contractInfoTable = [
        { property: 'Address', value: chalk.default.yellow(address) },
        { property: 'Name', value: '(Contract not verified)' },
        { property: 'Network', value: chainConfig.name },
        { property: 'Deployment Block', value: result?.deploymentBlock || 'Unknown' },
        { property: 'Verified', value: chalk.default.yellow('No') },
      ];

      // Add a small separator before links section
      contractInfoTable.push({ property: '---', value: '---' });

      // Always add explorer links
      if (chainConfig.blockExplorer) {
        const explorerBaseUrl = chainConfig.blockExplorer.endsWith('/api')
          ? chainConfig.blockExplorer.slice(0, -4)
          : chainConfig.blockExplorer;

        const explorerLink = `${explorerBaseUrl}/address/${address}`;
        contractInfoTable.push({
          property: 'Explorer Link',
          value: chalk.default.blue.underline(explorerLink),
        });
      }

      // Add proxy information when available (this section is already handled earlier in the code)
      if (result?.contractInfo?.proxy) {
        contractInfoTable.push({
          property: 'Proxy',
          value: chalk.default.yellow('Yes'),
        });

        if (result.contractInfo.implementation && result.contractInfo.implementation !== '') {
          contractInfoTable.push({
            property: 'Implementation',
            value: result.contractInfo.implementation,
          });
        } else {
          contractInfoTable.push({
            property: 'Implementation',
            value: chalk.default.yellow('Unknown (proxy detected but implementation not found)'),
          });
        }
      } else {
        contractInfoTable.push({
          property: 'Proxy',
          value: '(Verification required to determine)',
        });
      }

      console.log(createTable(contractInfoTable));
      console.log(
        '\n' +
          chalk.default.bold.green(
            'Analysis finished. Limited data available for unverified contracts.'
          ) +
          '\n'
      );
      return;
    }

    process.exit(1);
  }
}

// Analyze command using the common function
program
  .command('analyze <address>')
  .description('Analyze a smart contract')
  .option(
    '-c, --chain <chain>',
    'Blockchain network to use (selected from global config or ethereum)',
    null
  )
  .option('-k, --key <key>', 'Block explorer API key')
  .option(
    '-b, --block-range <number>',
    'Block range size for scanning (reduce to 500 if you encounter range limit errors)',
    '1000'
  )
  .option('-d, --dev', 'Development mode - forces prompt for API keys', false)
  .action(analyzeContract);

program.parse(process.argv);

// The old code for handling the global -a/--address option has been replaced
// by the preprocessing of process.argv at the beginning of the file
