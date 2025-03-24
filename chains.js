/**
 * Chain configuration manager for the contract-analyzer CLI
 * 
 * This module handles loading, saving, and managing custom chain configurations
 * for EVM-compatible blockchains.
 */
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Path to store the configuration
const CONFIG_DIR = path.join(os.homedir(), '.contract-analyzer');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Selected configuration
const DEFAULT_CONFIG = {
    chains: {
        ethereum: {
            name: 'Ethereum Mainnet',
            blockExplorer: 'https://api.etherscan.io/api',
            blockExplorerName: 'Etherscan',
            chainId: 1,
            apiKey: ''
        }
    },
    selectedChain: 'ethereum',
    apiKeys: {},
    preferences: {
        outputFormat: 'json'
    },
    lastUpdated: new Date().toISOString()
};

// Extended chains - these are available but not included by selected
// Users can add these manually with the chains add command
const EXTENDED_CHAINS = {
    polygon: {
        name: 'Polygon Mainnet',
        blockExplorer: 'https://api.polygonscan.com/api',
        blockExplorerName: 'Polygonscan',
        chainId: 137
    },
    arbitrum: {
        name: 'Arbitrum One',
        blockExplorer: 'https://api.arbiscan.io/api',
        blockExplorerName: 'Arbiscan',
        chainId: 42161
    },
    optimism: {
        name: 'Optimism',
        blockExplorer: 'https://api-optimistic.etherscan.io/api',
        blockExplorerName: 'Optimism Etherscan',
        chainId: 10
    },
    bsc: {
        name: 'BNB Smart Chain',
        blockExplorer: 'https://api.bscscan.com/api',
        blockExplorerName: 'BscScan',
        chainId: 56
    },
    base: {
        name: 'Base',
        blockExplorer: 'https://api.basescan.org/api',
        blockExplorerName: 'BaseScan',
        chainId: 8453
    }
};

/**
 * Load configuration from file
 * 
 * @returns {Promise<Object>} The configuration object
 */
async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Return default config if file doesn't exist or can't be parsed
        return { ...DEFAULT_CONFIG };
    }
}

/**
 * Save configuration to file
 * 
 * @param {Object} config - The configuration to save
 * @returns {Promise<boolean>} Success status
 */
async function saveConfig(config) {
    try {
        await fs.mkdir(CONFIG_DIR, { recursive: true });
        await fs.writeFile(
            CONFIG_FILE, 
            JSON.stringify(config, null, 2)
        );
        return true;
    } catch (error) {
        console.error('Error saving configuration:', error.message);
        return false;
    }
}

/**
 * Initialize the configuration directory and config file
 */
async function initChainConfig() {
    try {
        await fs.mkdir(CONFIG_DIR, { recursive: true });
        
        // Check if config file exists, if not create it with defaults
        try {
            await fs.access(CONFIG_FILE);
            
            // If file exists, make sure the ethereum chain is present
            const config = await loadConfig();
            
            // Ensure Ethereum is always present with the correct configuration
            if (!config.chains || !config.chains.ethereum) {
                config.chains = config.chains || {};
                config.chains.ethereum = DEFAULT_CONFIG.chains.ethereum;
                await saveConfig(config);
            }
        } catch (error) {
            // File doesn't exist, create it with defaults
            await saveConfig(DEFAULT_CONFIG);
        }
        
        return true;
    } catch (error) {
        console.error('Error initializing config:', error.message);
        return false;
    }
}

/**
 * Get all chain configurations
 * 
 * @returns {Promise<Object>} Object containing all chains
 */
async function getChains() {
    await initChainConfig();
    
    try {
        const config = await loadConfig();
        
        // Ensure ethereum is always present
        const chains = config.chains || {};
        if (!chains.ethereum) {
            chains.ethereum = DEFAULT_CONFIG.chains.ethereum;
        }
        
        return chains;
    } catch (error) {
        console.error('Error loading chains:', error.message);
        return DEFAULT_CONFIG.chains;
    }
}

/**
 * Add a new chain configuration
 * 
 * @param {string} id - Chain identifier
 * @param {Object} chainConfig - Chain configuration
 * @param {string} chainConfig.name - Chain name
 * @param {string} chainConfig.blockExplorer - Block explorer API URL
 * @param {string} chainConfig.blockExplorerName - Block explorer name
 * @param {number} [chainConfig.chainId=0] - Chain ID (optional)
 * @param {string} [chainConfig.apiKey=''] - API key for the block explorer
 * @returns {Promise<boolean>} Success flag
 */
async function addChain(id, chainConfig) {
    if (!id || typeof id !== 'string') {
        throw new Error('Chain ID is required');
    }
    
    // Validate required fields
    const requiredFields = ['name', 'blockExplorer', 'blockExplorerName'];
    for (const field of requiredFields) {
        if (!chainConfig[field]) {
            throw new Error(`Chain configuration must include ${field}`);
        }
    }
    
    // Get existing config
    const config = await loadConfig();
    
    // Add the new chain
    config.chains = config.chains || {};
    config.chains[id.toLowerCase()] = {
        name: chainConfig.name,
        blockExplorer: chainConfig.blockExplorer,
        blockExplorerName: chainConfig.blockExplorerName,
        chainId: chainConfig.chainId || 0,
        apiKey: chainConfig.apiKey || ''
    };
    
    config.lastUpdated = new Date().toISOString();
    
    // Save the updated configuration
    return await saveConfig(config);
}

/**
 * Remove a chain configuration
 * 
 * @param {string} id - Chain identifier to remove
 * @returns {Promise<boolean>} Success status
 */
async function removeChain(id) {
    if (!id || typeof id !== 'string') {
        throw new Error('Invalid chain ID');
    }
    
    // Cannot remove ethereum
    if (id.toLowerCase() === 'ethereum') {
        throw new Error('Cannot remove the selected Ethereum chain');
    }
    
    // Load existing config
    const config = await loadConfig();
    
    // Check if chain exists in custom configs
    if (!config.chains || !config.chains[id.toLowerCase()]) {
        throw new Error(`Chain '${id}' not found`);
    }
    
    // Remove the chain
    delete config.chains[id.toLowerCase()];
    
    config.lastUpdated = new Date().toISOString();
    
    // Save the updated configuration
    return await saveConfig(config);
}

/**
 * Get details for a specific chain
 * 
 * @param {string} id - Chain identifier
 * @returns {Promise<Object|null>} Chain configuration or null if not found
 */
async function getChain(id) {
    if (!id || typeof id !== 'string') {
        return DEFAULT_CONFIG.chains.ethereum;
    }
    
    const config = await loadConfig();
    return (config.chains && config.chains[id.toLowerCase()]) || null;
}

/**
 * Get example chains that can be added
 * 
 * @returns {Array} Array of chain identifiers that can be added
 */
async function getAvailableChains() {
    const config = await loadConfig();
    return Object.keys(EXTENDED_CHAINS).filter(id => !config.chains || !config.chains[id]);
}

/**
 * Set the selected chain
 * 
 * @param {string} id - Chain identifier
 * @returns {Promise<boolean>} Success status
 */
async function setSelectedChain(id) {
    if (!id || typeof id !== 'string') {
        throw new Error('Invalid chain ID');
    }
    
    const config = await loadConfig();
    
    // Check if chain exists
    if (!config.chains || !config.chains[id.toLowerCase()]) {
        throw new Error(`Chain '${id}' not found`);
    }
    
    // Update selected chain
    config.selectedChain = id.toLowerCase();
    config.lastUpdated = new Date().toISOString();
    
    // Save the updated configuration
    return await saveConfig(config);
}

/**
 * Get the selected chain
 * 
 * @returns {Promise<string>} Selected chain identifier
 */
async function getSelectedChain() {
    const config = await loadConfig();
    return config.selectedChain || '';
}

/**
 * Save API key for a specific chain
 * 
 * @param {string} chain - Chain identifier
 * @param {string|Object} apiKey - API key string or object with apiKey and blockscannerUrl
 * @returns {Promise<boolean>} Success status
 */
async function saveApiKey(chain, apiKey) {
    if (!chain || typeof chain !== 'string') {
        throw new Error('Invalid chain ID');
    }
    
    const config = await loadConfig();
    
    // Check if chain exists
    if (!config.chains || !config.chains[chain.toLowerCase()]) {
        throw new Error(`Chain '${chain}' not found`);
    }
    
    // Handle both string and object formats for backward compatibility
    if (typeof apiKey === 'object' && apiKey !== null) {
        // New format: {apiKey, blockscannerUrl}
        if (apiKey.apiKey) {
            config.chains[chain.toLowerCase()].apiKey = apiKey.apiKey;
            
            // Also store in apiKeys section for backward compatibility
            config.apiKeys = config.apiKeys || {};
            config.apiKeys[`${chain.toUpperCase()}_EXPLORER_KEY`] = apiKey.apiKey;
        }
        
        // Update blockExplorer URL if provided
        if (apiKey.blockscannerUrl) {
            // Ensure the URL is in API format by adding /api if needed
            const baseUrl = apiKey.blockscannerUrl.endsWith('/') 
                ? apiKey.blockscannerUrl.slice(0, -1) 
                : apiKey.blockscannerUrl;
                
            // Convert website URL to API URL
            // Example: https://etherscan.io -> https://api.etherscan.io/api
            let apiUrl = baseUrl;
            if (!baseUrl.includes('/api') && !baseUrl.includes('api.')) {
                // Replace https://DOMAIN with https://api.DOMAIN/api
                const urlObj = new URL(baseUrl);
                apiUrl = `https://api.${urlObj.hostname}/api`;
            } else if (!baseUrl.endsWith('/api')) {
                apiUrl = `${baseUrl}/api`;
            }
            
            config.chains[chain.toLowerCase()].blockExplorer = apiUrl;
        }
    } else {
        // Old format: string (just the API key)
        config.chains[chain.toLowerCase()].apiKey = apiKey;
        
        // Also store in apiKeys section for backward compatibility
        config.apiKeys = config.apiKeys || {};
        config.apiKeys[`${chain.toUpperCase()}_EXPLORER_KEY`] = apiKey;
    }
    
    config.lastUpdated = new Date().toISOString();
    
    // Save the updated configuration
    return await saveConfig(config);
}

/**
 * Get API key for a specific chain
 * 
 * @param {string} chain - Chain identifier
 * @returns {Promise<string>} API key
 */
async function getApiKey(chain) {
    if (!chain || typeof chain !== 'string') {
        return '';
    }
    
    const config = await loadConfig();
    
    // Check in chain configuration first
    if (config.chains && config.chains[chain.toLowerCase()] && config.chains[chain.toLowerCase()].apiKey) {
        return config.chains[chain.toLowerCase()].apiKey;
    }
    
    // Fall back to apiKeys section
    if (config.apiKeys && config.apiKeys[`${chain.toUpperCase()}_EXPLORER_KEY`]) {
        return config.apiKeys[`${chain.toUpperCase()}_EXPLORER_KEY`];
    }
    
    return '';
}

// For backward compatibility with code using the old networks.js
const getNetworks = getChains;
const getNetwork = getChain;
const addNetwork = addChain;
const removeNetwork = removeChain;
const initNetworkConfig = initChainConfig;
const getAvailableNetworks = getAvailableChains;
const DEFAULT_NETWORKS = DEFAULT_CONFIG.chains;
const EXTENDED_NETWORKS = EXTENDED_CHAINS;

export { 
    getChains, 
    getChain, 
    addChain, 
    removeChain, 
    getAvailableChains,
    setSelectedChain,
    getSelectedChain,
    saveApiKey,
    getApiKey,
    initChainConfig,
    
    // Legacy exports
    getNetworks,
    getNetwork,
    addNetwork,
    removeNetwork,
    initNetworkConfig,
    getAvailableNetworks,
    DEFAULT_NETWORKS,
    EXTENDED_NETWORKS
}; 