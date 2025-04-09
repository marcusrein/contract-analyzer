#!/usr/bin/env node

import { Command } from 'commander';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Import commands
import { analyzeContract } from './cli/commands/analyze.js';
import { registerChainCommands } from './cli/commands/chains.js'; // Import chain command registration function
import { setupCommand } from './cli/commands/setup.js'; // Import setup command handler

// Basic setup
config(); // Load .env file

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamically load version from package.json
async function getPackageVersion() {
    try {
        // Adjust path depending on whether running from src or dist
        const pkgPath = path.resolve(__dirname, '../package.json');
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
        return pkg.version || 'unknown';
    } catch (error) {
        console.warn('Warning: Could not read version from package.json:', error.message);
        return 'unknown'; // Fallback version
    }
}

const program = new Command();

async function main() {
    const version = await getPackageVersion();

    program
        .name('contract-analyzer')
        .description('Analyze smart contracts using Sourcify and block explorers')
        .version(version);

    // --- Define Commands ---

    // Analyze command
    program
        .command('analyze <address>')
        .description('Analyze a smart contract using Sourcify (and block explorer fallback later)')
        .option('-c, --chain <chainId>', 'Specify target chain ID (optional, defaults to selected chain)')
        .option('-e, --events', 'Fetch recent raw event logs (requires block explorer API key)')
        // Add other options from the old CLI as needed, e.g.,
        // .option('-e, --events', 'Analyze contract events (TODO)')
        // .option('-s, --subgraph', 'Generate subgraph templates (TODO)')
        .action(analyzeContract);

    // Register chain management commands (list, add, set, remove)
    registerChainCommands(program);

    // Setup command
    program
        .command('setup')
        .description('Run interactive setup to configure API keys')
        .action(setupCommand);

    // TODO: Add setup command

    await program.parseAsync(process.argv);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
}); 