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
    getApiKey
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

const program = new Command();

// Debug information
console.log('CLI location:', __filename);
console.log('Current directory:', process.cwd());

// Function to prompt for input
const prompt = (query) => new Promise((resolve) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question(query, (answer) => {
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
    .description('Analyze smart contracts on Ethereum and other EVM-compatible blockchains.\n\nRun "cana setup" to set up new chains.')
    .version(version)
    .option('-a, --address <address>', 'Shorthand to analyze the provided contract address')
    .action(async (options) => {
        // If the address option is used at the root level, forward to analyze command
        if (options.address) {
            try {
                // Execute analyze command directly with the provided address
                await program.parseAsync(['analyze', options.address], { from: 'user' });
            } catch (error) {
                console.error('Error executing analyze command:', error.message);
            }
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
const chainsCommand = program
    .command('chains')
    .description('Manage blockchain chains');

// Default chains command (simple list)
chainsCommand
    .action(async (options) => {
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
                    if (a === selectedChain) return -1;
                    if (b === selectedChain) return 1;
                    return a.localeCompare(b);
                })
                .forEach(id => {
                    if (id === selectedChain) {
                        console.log(`${id} (selected)`);
                    } else {
                        console.log(id);
                    }
                });
            
            console.log('\nUse with: cana -a <address> -c <chain>');
            console.log('For more details: cana chains list');
            console.log('To switch selected chain: cana chains --switch <chain>');
            
            // Allow adding a new chain immediately
            if (options.add) {
                console.log('\nAdding a new chain...');
                
                let id = await prompt('Network identifier (e.g., optimism, base): ');
                let name = await prompt('Network name (e.g., Optimism Mainnet): ');
                
                console.log('\nBlock explorer API URL:');
                console.log('- For Etherscan-compatible explorers, use their API URL');
                console.log('  Example: "https://api.etherscan.io/api"');
                console.log('- IMPORTANT: This should be the URL of the API, not your API key');
                console.log('  You will be prompted separately for your API key\n');
                let explorer = await prompt('Block explorer API URL: ');
                
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
                
                let explorerName = await prompt('Block explorer name (e.g., Etherscan, PolygonScan): ');
                
                const chainIdInput = await prompt('Chain ID (optional): ');
                let chainId = chainIdInput ? parseInt(chainIdInput, 10) : 0;
                
                // Add the network
                await addChain(id, {
                    name,
                    blockExplorer: explorer,
                    blockExplorerName: explorerName,
                    chainId
                });
                
                // Prompt for API key
                console.log(`\n🔑 API Key for ${explorerName}`);
                console.log('---------------------');
                console.log(`You can get an API key from ${explorer.replace('/api', '')}`);
                let key = await prompt(`${explorerName} API Key: `);

                // Save the API key
                if (key) {
                    await saveApiKeys(id, key);
                }
                
                console.log(`\n✅ Setup complete! You can now analyze smart contracts on ${id} with: 'cana -a <contract-address>'`);
                
                console.log('\n📘 To add support for other EVM chains:');
                console.log('   cana chains --add');
                
                console.log('\n🔍 To switch chains:');
                console.log('   cana chains --switch <chain>');
                
                console.log('\n🔍 For a list of all chains use:');
                console.log('   cana chains list');
            } else {
                console.log('\nTo add a new chain: cana setup');
            }
            
        } catch (error) {
            console.error('\n❌ Error:', error.message);
            process.exit(1);
        }
    })
    .option('-a, --add', 'Add a new chain after listing')
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
            console.log('  cana chains --add');
            
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
    .action(async (options) => {
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
                chainId
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
    .action(async (id) => {
        try {
            // Validate chain ID
            if (id.toLowerCase() === 'ethereum') {
                console.error('\n❌ Error: Cannot remove the selected Ethereum network.');
                console.log('To modify Ethereum settings, edit your ~/.contract-analyzer/chains.json file directly.');
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

// Analyze command
program
    .command('analyze <address>')
    .description('Analyze a smart contract')
    .option('-c, --chain <chain>', 'Blockchain network to use (selected from global config or ethereum)', null)
    .option('-k, --key <key>', 'Block explorer API key')
    .option('-b, --block-range <number>', 'Block range size for scanning (reduce to 500 if you encounter range limit errors)', '1000')
    .option('-d, --dev', 'Development mode - forces prompt for API keys', false)
    .option('-s, --summary', 'Show only summary information (less detailed output)', false)
    .action(async (address, options) => {
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
                console.log('   You can also use: cana chains --switch <chain>');
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
            const chainConfig = networks[chain];
            const explorerKeyEnvName = `${chain.toUpperCase()}_EXPLORER_KEY`;
            
            // Load API keys from global config
            const apiKeys = await loadApiKeys();
            
            // Get or validate Explorer API key
            let explorerApiKey = options.key || apiKeys[explorerKeyEnvName] || process.env[explorerKeyEnvName] || process.env.ETHERSCAN_API_KEY;
            
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
                const saved = await saveApiKeys(
                    chain,
                    explorerApiKey
                );
                
                if (!saved) {
                    console.log('\n⚠️  Could not save API key to .env file, but continuing with provided key...');
                }
            }

            console.log('\n🔍 Starting contract analysis...');
            console.log(`Contract Address: ${address}`);
            console.log(`Network: ${chainConfig.name}`);
            console.log(`Block Explorer: ${chainConfig.blockExplorerName}`);

            const result = await getDeploymentBlock(
                null,
                address,
                explorerApiKey,
                parseInt(options.blockRange),
                chainConfig.blockExplorer,
                chain
            );

            if (!result) {
                console.error('\n❌ Analysis failed or no deployment found');
                console.log('\nTry running with the dev flag to re-enter API keys:');
                console.log(`cana analyze ${address} -d`);
                process.exit(1);
            }
            
            const chalk = await import('chalk').catch(() => {
                // If chalk is not installed, provide a basic implementation
                return {
                    default: {
                        green: (text) => text,
                        yellow: (text) => text,
                        blue: (text) => text,
                        cyan: (text) => text,
                        red: (text) => text,
                        gray: (text) => text,
                        bold: {
                            green: (text) => text,
                            yellow: (text) => text,
                            blue: (text) => text,
                            white: (text) => text
                        }
                    }
                };
            });
            
            // Helper function to create a table-like display
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
            
            console.log('\n' + chalk.default.bold.green('✅ CONTRACT ANALYSIS COMPLETE') + '\n');
            
            // Contract Information Section
            console.log(chalk.default.bold.blue('📄 CONTRACT INFORMATION'));
            console.log('───────────────────────────────────');
            
            const contractInfoTable = [
                { property: 'Address', value: chalk.default.yellow(address) },
                { property: 'Name', value: result.contractInfo?.contractName || (result.contractInfo?.isVerified === false ? '(Contract not verified)' : 'Unknown') },
                { property: 'Network', value: chainConfig.name },
                { property: 'Deployment Block', value: result.deploymentBlock || 'Unknown' },
                { property: 'Verified', value: result.contractInfo?.isVerified ? chalk.default.green('Yes') : chalk.default.yellow('No') },
                { property: 'Proxy', value: result.contractInfo?.proxy ? chalk.default.yellow('Yes') : (result.contractInfo?.isVerified === false ? '(Verification required)' : 'No') }
            ];
            
            if (result.contractInfo?.proxy && result.contractInfo.implementation) {
                contractInfoTable.push({ property: 'Implementation', value: result.contractInfo.implementation });
            }
            
            // Always add explorer links if possible
            if (chainConfig.blockExplorer) {
                const explorerBaseUrl = chainConfig.blockExplorer.replace('/api', '');
                contractInfoTable.push({ 
                    property: 'Explorer Link', 
                    value: `${explorerBaseUrl}/address/${address}`
                });
            }
            
            if (result.contractInfo?.sourceUrl && result.contractInfo.isVerified) {
                contractInfoTable.push({ 
                    property: 'Source Code', 
                    value: result.contractInfo.sourceUrl 
                });
            } else if (result.contractInfo?.isVerified === false) {
                contractInfoTable.push({ 
                    property: 'Source Code', 
                    value: '(Contract not verified)' 
                });
            }
            
            console.log(createTable(contractInfoTable));
            
            // Files Section
            console.log(chalk.default.bold.blue('💾 SAVED FILES'));
            console.log('───────────────────');
            
            const outputDir = path.join('contracts-analyzed', result.outputDir || 'contract-info');
            
            const filesTable = [];
            
            if (result.contractInfo?.isVerified) {
                filesTable.push(
                    { file: `${outputDir}/abi.json`, description: 'Contract ABI' },
                    { file: `${outputDir}/contract/`, description: 'Individual Contract Source Files' },
                    { file: `${outputDir}/event-information.json`, description: 'Contract Event Signatures and Examples (3 per type)' }
                );
            } else {
                filesTable.push(
                    { file: `${outputDir}/abi.json`, description: 'Placeholder ABI (Contract not verified)' },
                    { file: `${outputDir}/event-information.json`, description: 'On-chain Event Examples (limited data)' }
                );
                
                // Add additional note about verification
                console.log(chalk.default.yellow('⚠️ This contract is not verified. Limited data available.'));
                console.log(chalk.default.yellow('   To access full contract details, verify the contract on the block explorer.'));
            }
            
            console.log(createTable(filesTable));
            
            // Event Signature Section (even if unverified, we might have collected some information)
            if (result.contractInfo?.eventSignatures?.length > 0 || events?.length > 0) {
                console.log(chalk.default.bold.blue('📊 EVENT SIGNATURES'));
                console.log('─────────────────────');
                
                const eventSigTable = [];
                
                if (result.contractInfo?.eventSignatures?.length > 0) {
                    result.contractInfo.eventSignatures.forEach(event => {
                        eventSigTable.push({
                            name: event.name || 'Unknown',
                            signature: event.signature || '-',
                            hash: event.signatureHash || '-'
                        });
                    });
                    
                    console.log(createTable(eventSigTable, { name: 'Event Name', signature: 'Signature', hash: 'Hash' }));
                } else {
                    console.log(chalk.default.yellow('⚠️ No event signatures found or contract not verified.'));
                    console.log(chalk.default.yellow('   However, on-chain events have been collected to help with analysis.'));
                }
            }

            console.log('\n' + chalk.default.bold.green('Analysis finished. All data saved to disk.') + '\n');
            console.log(`${chalk.default.gray('Use')} ${chalk.default.bold.blue('cana analyze ' + address + ' -s')} ${chalk.default.gray('for summary view')}`);
            console.log(`${chalk.default.gray('Use')} ${chalk.default.bold.blue('cana analyze ' + address)} ${chalk.default.gray('for detailed view')}`);

        } catch (error) {
            console.error('\n❌ Error:', error.message);
            
            if (error.message.includes('Cannot read properties of null (reading \'abi\')')) {
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
                    { property: 'Verified', value: chalk.default.yellow('No') }
                ];
                
                // Always add explorer links
                if (chainConfig.blockExplorer) {
                    const explorerBaseUrl = chainConfig.blockExplorer.replace('/api', '');
                    contractInfoTable.push({ 
                        property: 'Explorer Link', 
                        value: `${explorerBaseUrl}/address/${address}`
                    });
                }
                
                contractInfoTable.push({ 
                    property: 'Source Code', 
                    value: '(Contract not verified)' 
                });
                
                console.log(createTable(contractInfoTable));
                
                // Files Section - show what we saved
                console.log(chalk.default.bold.blue('💾 SAVED FILES'));
                console.log('───────────────────');
                
                const outputDir = path.join('contracts-analyzed', address.substring(0, 10));
                
                const filesTable = [
                    { file: `${outputDir}/basic-info.json`, description: 'Basic Contract Information' }
                ];
                
                console.log(createTable(filesTable));
                
                // Events Section - placeholder
                console.log(chalk.default.bold.blue('🔔 EVENTS'));
                console.log('─────────────────────');
                console.log('Contract verification required to decode events');
                
                console.log('\n' + chalk.default.bold.green('Analysis finished with limited data.') + '\n');
            }
            else if (error.message.includes('API_KEY_ERROR')) {
                console.error("\n📝 API Key Issue Detected:");
                console.error("  The analysis failed due to an API key problem.");
                console.error("  Please try running with the -d flag to re-enter your API keys:");
                console.error(`  cana analyze ${address} -d`);
            } else if (error.message.includes('Failed to parse URL') || error.message.includes('Invalid URL')) {
                console.error("\n🌐 URL Error Detected:");
                console.error("  It appears that the Block Explorer URL you provided may be invalid or");
                console.error("  you might have used your API key as the URL.");
                console.error("\n  Please remember:");
                console.error("  - The Block Explorer URL should be the API endpoint (e.g., https://api.etherscan.io/api)");
                console.error("  - Your API key is a separate value that you enter when prompted");
                console.error("\n  Fix your chain configuration by running:");
                console.error(`  cana chains remove ${options.chain}`);
                console.error(`  cana chains --add`);
            } else if (error.message.includes('NETWORK_ERROR')) {
                console.error("\n🌐 Network Issue Detected:");
                console.error("  The analysis failed due to a network connectivity problem.");
                console.error("  - Check your internet connection");
                console.error("  - Verify the RPC endpoint is functioning");
                console.error("  - The service might be experiencing issues or rate limiting");
                
                // Add specific advice for range limit errors
                if (error.message.includes('Range exceeds limit')) {
                    console.error("\n⚠️ Range Limit Error Detected:");
                    console.error("  Your RPC provider has a block range limit restriction.");
                    console.error("  Try reducing the block range with the -b flag:");
                    console.error(`  cana analyze ${address} -b 500`);
                }
            }
        }
    });

// Add setup command
program
    .command('setup')
    .description('Set up the tool with API keys and network configurations')
    .action(async () => {
        try {
            await setup();
        } catch (error) {
            console.error('\n❌ Setup failed:', error.message);
            process.exit(1);
        }
    });

program.parse();