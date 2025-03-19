#!/usr/bin/env node

import { Command } from 'commander';
import { config } from 'dotenv';
import { getDeploymentBlock } from './startBlock.js';
import readline from 'readline';
import fs from 'fs/promises';
import path from 'path';
import { getNetworks, getNetwork, addNetwork, removeNetwork } from './networks.js';

// Load environment variables
config();

const program = new Command();

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

// Function to save API keys
async function saveApiKeys(chain, alchemyKey, explorerKey) {
    let envContent = '';
    
    try {
        // Get network configuration
        const networkConfig = await getNetwork(chain);
        if (!networkConfig) {
            throw new Error(`Network configuration not found for: ${chain}`);
        }
        
        // For chains that use Alchemy
        if (networkConfig.rpcFormat.includes('{key}')) {
            envContent = `RPC_URL=${networkConfig.rpcFormat.replace('{key}', alchemyKey)}\n`;
        } else {
            // For chains with fixed RPC endpoints
            envContent = `RPC_URL=${networkConfig.rpcFormat}\n`;
        }
        
        // Add explorer API key
        const explorerKeyEnvName = `${chain.toUpperCase()}_EXPLORER_KEY`;
        envContent += `${explorerKeyEnvName}=${explorerKey}\n`;
        envContent += `SELECTED_CHAIN=${chain}\n`;
        
        await fs.writeFile('.env', envContent);
        console.log('\n✅ API keys saved to .env file');
        return true;
    } catch (error) {
        console.error(`\n❌ Error saving API keys: ${error.message}`);
        return false;
    }
}

// Function to validate API keys before analysis
function validateApiKeys(rpcUrl, explorerApiKey) {
    const errors = [];
    
    if (!rpcUrl || rpcUrl.includes('your-') || rpcUrl.includes('{key}')) {
        errors.push('Invalid RPC URL. It contains placeholder text or is missing.');
    }
    
    if (!explorerApiKey || explorerApiKey.includes('your-') || explorerApiKey === 'your-key') {
        errors.push('Invalid block explorer API key. It contains placeholder text or is missing.');
    }
    
    return errors;
}

program
    .name('contract-analyzer')
    .description('Analyze smart contracts on Ethereum and other EVM-compatible blockchains')
    .version('1.0.0');

// Networks command group
const networksCommand = program
    .command('networks')
    .description('Manage network configurations');

// List networks
networksCommand
    .command('list')
    .description('List all available networks')
    .action(async () => {
        try {
            const networks = await getNetworks();
            
            console.log('\nAvailable Networks:');
            console.log('------------------');
            
            // List Ethereum first
            if (networks['ethereum']) {
                const config = networks['ethereum'];
                console.log(`\nethereum (default):`);
                console.log(`  Name: ${config.name}`);
                console.log(`  Chain ID: ${config.chainId || 'N/A'}`);
                console.log(`  RPC Format: ${config.rpcFormat}`);
                console.log(`  Block Explorer: ${config.blockExplorerName} (${config.blockExplorer})`);
            }
            
            // List other networks
            if (Object.keys(networks).length > 1) {
                console.log('\nAdditional Networks:');
                Object.entries(networks).forEach(([id, config]) => {
                    if (id !== 'ethereum') {
                        console.log(`\n${id}:`);
                        console.log(`  Name: ${config.name}`);
                        console.log(`  Chain ID: ${config.chainId || 'N/A'}`);
                        console.log(`  RPC Format: ${config.rpcFormat}`);
                        console.log(`  Block Explorer: ${config.blockExplorerName} (${config.blockExplorer})`);
                    }
                });
            }
            
            console.log('\nTo add a new network:');
            console.log('  contract-analyzer networks add');
            
        } catch (error) {
            console.error('\n❌ Error listing networks:', error.message);
            process.exit(1);
        }
    });

// Add network
networksCommand
    .command('add')
    .description('Add a new EVM-compatible network configuration')
    .option('-i, --id <id>', 'Network identifier (e.g., optimism, polygon)')
    .option('-n, --name <name>', 'Network name (e.g., Optimism Mainnet)')
    .option('-r, --rpc <url>', 'RPC URL or format (use {key} for API key placeholders)')
    .option('-e, --explorer <url>', 'Block explorer API URL')
    .option('-x, --explorer-name <name>', 'Block explorer name (e.g., Etherscan, Optimism Explorer)')
    .option('-c, --chain-id <id>', 'Chain ID (optional)')
    .action(async (options) => {
        try {
            // If any required options are missing, prompt for them
            let { id, name, rpc, explorer, explorerName, chainId } = options;
            
            console.log('\n🔗 Add New EVM-Compatible Network');
            console.log('--------------------------------');
            console.log('This will add a new network to your local configuration.\n');
            
            if (!id) {
                id = await prompt('Network identifier (e.g., optimism, base): ');
            }
            
            if (!name) {
                name = await prompt('Network name (e.g., Optimism Mainnet): ');
            }
            
            if (!rpc) {
                console.log('\nRPC URL format:');
                console.log('- For public endpoints: "https://rpc.example.com"');
                console.log('- For services requiring API keys: "https://provider.com/{key}"');
                console.log('  (Use {key} as a placeholder for your API key)\n');
                rpc = await prompt('RPC URL or format: ');
            }
            
            if (!explorer) {
                console.log('\nBlock explorer API URL:');
                console.log('- For Etherscan-compatible explorers, use their API URL');
                console.log('  Example: "https://api.etherscan.io/api"\n');
                explorer = await prompt('Block explorer API URL: ');
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
            await addNetwork(id, {
                name,
                rpcFormat: rpc,
                blockExplorer: explorer,
                blockExplorerName: explorerName,
                chainId
            });
            
            console.log(`\n✅ Network '${id}' added successfully!`);
            console.log('\n📝 Usage Example:');
            console.log(`contract-analyzer analyze -a 0xYourContractAddress -c ${id}`);
            
        } catch (error) {
            console.error('\n❌ Error adding network:', error.message);
            process.exit(1);
        }
    });

// Remove network
networksCommand
    .command('remove')
    .description('Remove a custom network configuration')
    .argument('<id>', 'Network identifier to remove')
    .action(async (id) => {
        try {
            if (id.toLowerCase() === 'ethereum') {
                console.error('Error: Cannot remove the default Ethereum network.');
                console.log('To modify Ethereum settings, edit your ~/.contract-analyzer/networks.json file directly.');
                process.exit(1);
            }
            
            await removeNetwork(id);
            console.log(`\n✅ Network '${id}' removed successfully!`);
        } catch (error) {
            console.error('\n❌ Error removing network:', error.message);
            process.exit(1);
        }
    });

// Analyze command
program
    .command('analyze')
    .description('Analyze a smart contract')
    .requiredOption('-a, --address <address>', 'Contract address to analyze')
    .option('-c, --chain <chain>', 'Blockchain network to use (default: ethereum)', 'ethereum')
    .option('-r, --rpc <url>', 'RPC URL for the blockchain network')
    .option('-k, --key <key>', 'Block explorer API key')
    .option('-b, --block-range <number>', 'Block range size for scanning', '10000')
    .option('-d, --dev', 'Development mode - forces prompt for API keys', false)
    .action(async (options) => {
        try {
            // If chain is not ethereum, remind user they're using a non-default chain
            if (options.chain !== 'ethereum') {
                console.log(`\n⚠️  Using non-default chain: ${options.chain.toUpperCase()}`);
                console.log('   Make sure this chain is configured with: contract-analyzer networks list');
            }
            
            // Get all available networks
            const networks = await getNetworks();
            
            // Validate chain selection
            const chain = options.chain.toLowerCase();
            if (!networks[chain]) {
                console.error(`\n❌ Error: Unsupported chain "${chain}"`);
                console.log('\nAvailable networks:');
                console.log(`- ethereum (default)`);
                
                const otherNetworks = Object.keys(networks).filter(id => id !== 'ethereum');
                if (otherNetworks.length > 0) {
                    otherNetworks.forEach(id => console.log(`- ${id}`));
                }
                
                console.log('\nTo add a new network, run:');
                console.log('contract-analyzer networks add');
                
                process.exit(1);
            }
            
            // Get the chain configuration
            const chainConfig = networks[chain];
            const explorerKeyEnvName = `${chain.toUpperCase()}_EXPLORER_KEY`;
            
            // Get or validate RPC and Explorer API keys
            let rpcUrl = options.rpc || process.env.RPC_URL;
            let explorerApiKey = options.key || process.env[explorerKeyEnvName] || process.env.ETHERSCAN_API_KEY;
            
            // Validate API keys
            const keyErrors = validateApiKeys(rpcUrl, explorerApiKey);
            
            // Check if keys are valid or dev mode is enabled
            const needsKeys = options.dev || keyErrors.length > 0;

            // If no API keys are provided or they're default values, prompt for them
            if (needsKeys) {
                console.log('\n🔑 API Keys Required');
                console.log('-----------------');
                console.log(`Chain: ${chainConfig.name}`);
                console.log(`Block Explorer: ${chainConfig.blockExplorerName}`);
                
                if (keyErrors.length > 0) {
                    console.log('\n⚠️  API Key Issues Detected:');
                    keyErrors.forEach(err => console.log(`  - ${err}`));
                }
                
                // Only prompt for API key for chains that use key placeholders
                let alchemyKey = '';
                if (chainConfig.rpcFormat.includes('{key}')) {
                    console.log('\nPlease enter your API key for RPC:');
                    console.log(`Using RPC format: ${chainConfig.rpcFormat}`);
                    alchemyKey = await prompt('API Key: ');
                    rpcUrl = chainConfig.rpcFormat.replace('{key}', alchemyKey);
                } else {
                    // For chains with fixed RPC URL
                    rpcUrl = chainConfig.rpcFormat;
                    console.log(`\nUsing RPC URL: ${rpcUrl}`);
                }

                console.log(`\nPlease enter your ${chainConfig.blockExplorerName} API key:`);
                console.log(`You can get one at ${chainConfig.blockExplorer.replace('/api', '')}`);
                explorerApiKey = await prompt(`${chainConfig.blockExplorerName} API Key: `);

                // Save the keys to .env file
                const saved = await saveApiKeys(
                    chain,
                    alchemyKey,
                    explorerApiKey
                );
                
                if (!saved) {
                    console.log('\n⚠️  Could not save API keys to .env file, but continuing with provided keys...');
                }
            }

            console.log('\n🔍 Starting contract analysis...');
            console.log(`Contract Address: ${options.address}`);
            console.log(`Network: ${chainConfig.name}`);
            console.log(`Block Explorer: ${chainConfig.blockExplorerName}`);

            const result = await getDeploymentBlock(
                rpcUrl,
                options.address,
                explorerApiKey,
                parseInt(options.blockRange),
                chainConfig.blockExplorer
            );

            if (!result) {
                console.error('\n❌ Analysis failed or no deployment found');
                console.log('\nTry running with the dev flag to re-enter API keys:');
                console.log(`npm run analyze -- -a ${options.address} -d`);
                process.exit(1);
            }

            console.log('\n✅ Analysis complete!');
            console.log('📁 Results have been saved to the contract-info directory.');
            console.log('\n📊 Summary:');
            console.log(`Deployment Block: ${result.deploymentBlock}`);
            console.log(`Contract Verified: ${result.contractInfo?.isVerified ? 'Yes' : 'No'}`);

            console.log('\nProxy Information:');
            console.log(`Is Proxy: ${result.contractInfo?.proxy ? 'Yes' : 'No'}`);
            if (result.contractInfo?.proxy) {
                console.log(`Implementation: ${result.contractInfo.implementation}`);
            }

            if (result.contractInfo?.eventSignatures) {
                console.log('\nEvent Signatures:');
                result.contractInfo.eventSignatures.forEach(event => {
                    console.log(`- ${event.name}: ${event.signature} (${event.signatureHash})`);
                    event.inputs.forEach(input => {
                        console.log(`  • ${input.name}: ${input.type} ${input.indexed ? '(indexed)' : ''}`);
                    });
                });
            }

            // Generate subgraph templates if contract is verified
            if (result.contractInfo?.isVerified && result.contractInfo?.generateSubgraphTemplates) {
                const templates = result.contractInfo.generateSubgraphTemplates();
                if (templates) {
                    const subgraphDir = path.join(process.cwd(), 'subgraph');
                    await fs.mkdir(subgraphDir, { recursive: true });
                    
                    await fs.writeFile(
                        path.join(subgraphDir, 'schema.graphql'),
                        templates.schema
                    );
                    await fs.writeFile(
                        path.join(subgraphDir, 'src/mapping.ts'),
                        templates.mappings
                    );
                    
                    console.log('\n📝 Subgraph templates generated in the subgraph directory:');
                    console.log('- schema.graphql');
                    console.log('- src/mapping.ts');
                }
            }

        } catch (error) {
            console.error('\n❌ Error:', error.message);
            
            if (error.message.includes('API_KEY_ERROR')) {
                console.error("\n📝 API Key Issue Detected:");
                console.error("  The analysis failed due to an API key problem.");
                console.error("  Please try running with the -d flag to re-enter your API keys:");
                console.error(`  npm run analyze -- -a ${options.address} -d`);
            } else if (error.message.includes('NETWORK_ERROR')) {
                console.error("\n🌐 Network Issue Detected:");
                console.error("  The analysis failed due to a network connectivity problem.");
                console.error("  - Check your internet connection");
                console.error("  - Verify the RPC endpoint is functioning");
                console.error("  - The service might be experiencing issues or rate limiting");
            }
            
            process.exit(1);
        }
    });

program.parse(); 