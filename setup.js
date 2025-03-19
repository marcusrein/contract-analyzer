#!/usr/bin/env node

/**
 * Setup script for contract-analyzer
 * 
 * This script helps to set up the project for local development:
 * - Makes CLI script executable
 * - Initializes configuration
 */

import fs from 'fs/promises';
import { initChainConfig, saveApiKey, addChain } from './chains.js';
import path from 'path';
import readline from 'readline';

// Try importing nanospinner, but provide fallback if not installed
let createSpinner;
try {
    const { createSpinner: importedSpinner } = await import('nanospinner');
    createSpinner = importedSpinner;
} catch (error) {
    // Simple spinner fallback if nanospinner is not installed
    createSpinner = text => {
        console.log(`${text}`);
        return {
            start: () => ({
                success: ({ text }) => console.log(`✅ ${text}`),
                error: ({ text }) => console.log(`❌ ${text}`)
            })
        };
    };
}

// Function to prompt for input
const prompt = query => 
    new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question(query, answer => {
            rl.close();
            resolve(answer);
        });
    });

// Function to normalize chain name for comparison
const normalizeChainName = (name) => {
    return name.toLowerCase().replace(/\s+/g, '').replace('mainnet', '');
}

export async function setup() {
    console.log('\n🚀 Setting up cana\n');
    
    // Make CLI scripts executable
    const spinner = createSpinner('Making CLI scripts executable...').start();
    try {
        await fs.chmod(path.join(process.cwd(), 'cli.js'), '755');
        await fs.chmod(path.join(process.cwd(), 'test-local.js'), '755');
        spinner.success({ text: 'Made CLI scripts executable' });
    } catch (error) {
        spinner.error({ text: `Failed to make scripts executable: ${error.message}` });
        console.log('ℹ️  You may need to run: chmod +x cli.js test-local.js');
    }
    
    // Initialize configuration
    const configSpinner = createSpinner('Initializing chain configuration...').start();
    try {
        await initChainConfig();
        configSpinner.success({ text: 'Chain configuration initialized' });
    } catch (error) {
        configSpinner.error({ text: `Failed to initialize chain configuration: ${error.message}` });
    }
    
    // Ask the user if they want to set up API keys now
    const setupKeys = await prompt('\nWould you like to set up your chain configuration now? (y/n): ');
    
    if (setupKeys.toLowerCase() === 'y') {
        // Prompt for chain name
        console.log('\nChain Name:');
        console.log('Enter the name of the chain (e.g., "Ethereum Mainnet", "Base Sepolia", etc.)');
        const chainName = await prompt('Chain Name: ');
        
        // Check if this is equivalent to the default Ethereum chain
        const normalizedInput = normalizeChainName(chainName);
        const isDefaultEthereum = normalizedInput === 'ethereum';
        
        // If it's the default Ethereum chain, use "ethereum" as the ID
        // Otherwise, convert the chain name to a standardized format
        const chainId = isDefaultEthereum ? 'ethereum' : chainName.toLowerCase().replace(/\s+/g, '-');
        
        console.log(`\n${chainName} Blockscanner API Key:`);
        console.log('This is used to fetch contract information and verification status.');
        console.log(`You can get one from the ${chainName} blockscanner website.`);
        const apiKey = await prompt('API Key: ');
        
        console.log(`\n${chainName} Blockscanner API Endpoint:`);
        console.log('This is the API endpoint URL of the block explorer.');
        console.log('Example: https://api.etherscan.io/api (for Ethereum Mainnet)');
        const apiEndpoint = await prompt('API Endpoint: ');
        
        console.log(`\n${chainName} Block Explorer Name:`);
        console.log('Enter the name of the block explorer (e.g., "Etherscan", "Basescan", etc.)');
        const explorerName = await prompt('Block Explorer Name: ');
        
        // Register the chain or update existing one
        if (chainName && apiEndpoint && explorerName) {
            try {
                // Check if we're updating the default Ethereum chain
                if (isDefaultEthereum) {
                    console.log('\nUpdating default Ethereum chain configuration...');
                } else {
                    console.log(`\nAdding new chain: ${chainName}...`);
                }
                
                // Add/update the chain
                await addChain(chainId, {
                    name: chainName,
                    blockExplorer: apiEndpoint,
                    blockExplorerName: explorerName,
                    chainId: isDefaultEthereum ? 1 : 0 // Use proper chain ID for Ethereum
                });
                
                // Then save the API key
                await saveApiKey(chainId, apiKey);
                
                console.log(`✅ ${chainName} configuration saved successfully`);
            } catch (error) {
                console.error(`❌ Error saving configuration: ${error.message}`);
            }
        }
    }
    
    console.log('\n✨ Setup complete! You can now analyze smart contracts with:');
    console.log('   cana -a <contract-address>');
    
    console.log('\n📘 To add support for other EVM chains:');
    console.log('   cana chains --add');
    
    console.log('\n🔍 To switch chains:');
    console.log('   cana chains --switch <chain>');
    
    console.log('\n🔍 For a list of all chains use:');
    console.log('   cana chains list');
}

// Run the setup if this script is called directly
if (import.meta.url === import.meta.main) {
    setup().catch(console.error);
} 