/**
 * Network configuration manager for the contract-analyzer CLI
 * 
 * This module handles loading, saving, and managing custom network configurations
 * for EVM-compatible chains.
 */
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Path to store the networks configuration
const CONFIG_DIR = path.join(os.homedir(), '.contract-analyzer');
const NETWORKS_FILE = path.join(CONFIG_DIR, 'networks.json');

// Default network configurations
const DEFAULT_NETWORKS = {
    ethereum: {
        name: 'Ethereum Mainnet',
        blockExplorer: 'https://api.etherscan.io/api',
        blockExplorerName: 'Etherscan',
        chainId: 1
    }
};

// Extended networks - these are available but not included by default
// Users can add these manually with the networks add command
const EXTENDED_NETWORKS = {
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
 * Initialize the configuration directory and network file
 */
async function initNetworkConfig() {
    try {
        await fs.mkdir(CONFIG_DIR, { recursive: true });
        
        // Check if networks file exists, if not create it with defaults
        try {
            await fs.access(NETWORKS_FILE);
            
            // If file exists, make sure the ethereum network is present
            const data = await fs.readFile(NETWORKS_FILE, 'utf8');
            const config = JSON.parse(data);
            
            // Ensure Ethereum is always present with the correct configuration
            if (!config.networks || !config.networks.ethereum) {
                config.networks = config.networks || {};
                config.networks.ethereum = DEFAULT_NETWORKS.ethereum;
                await fs.writeFile(
                    NETWORKS_FILE, 
                    JSON.stringify(config, null, 2)
                );
            }
        } catch (error) {
            // File doesn't exist, create it with defaults
            await fs.writeFile(
                NETWORKS_FILE, 
                JSON.stringify({ 
                    networks: DEFAULT_NETWORKS, 
                    lastUpdated: new Date().toISOString() 
                }, null, 2)
            );
        }
        
        return true;
    } catch (error) {
        console.error('Error initializing network config:', error.message);
        return false;
    }
}

/**
 * Get all network configurations
 * 
 * @returns {Promise<Object>} Object containing all networks
 */
async function getNetworks() {
    await initNetworkConfig();
    
    try {
        const data = await fs.readFile(NETWORKS_FILE, 'utf8');
        const config = JSON.parse(data);
        
        // Ensure ethereum is always present
        const networks = config.networks || {};
        if (!networks.ethereum) {
            networks.ethereum = DEFAULT_NETWORKS.ethereum;
        }
        
        return networks;
    } catch (error) {
        console.error('Error loading networks:', error.message);
        return DEFAULT_NETWORKS;
    }
}

/**
 * Add a new network configuration
 * 
 * @param {string} id - Network identifier
 * @param {Object} networkConfig - Network configuration
 * @param {string} networkConfig.name - Network name
 * @param {string} networkConfig.blockExplorer - Block explorer API URL
 * @param {string} networkConfig.blockExplorerName - Block explorer name
 * @param {number} [networkConfig.chainId=0] - Chain ID (optional)
 * @returns {Promise<boolean>} Success flag
 */
async function addNetwork(id, networkConfig) {
    if (!id || typeof id !== 'string') {
        throw new Error('Network ID is required');
    }
    
    // Validate required fields
    const requiredFields = ['name', 'blockExplorer', 'blockExplorerName'];
    for (const field of requiredFields) {
        if (!networkConfig[field]) {
            throw new Error(`Network configuration must include ${field}`);
        }
    }
    
    // Get existing networks
    const networks = await getNetworks();
    
    // Add the new network
    networks[id.toLowerCase()] = {
        name: networkConfig.name,
        blockExplorer: networkConfig.blockExplorer,
        blockExplorerName: networkConfig.blockExplorerName,
        chainId: networkConfig.chainId || 0
    };
    
    // Save the updated configuration
    await fs.writeFile(
        NETWORKS_FILE, 
        JSON.stringify({ 
            networks,
            lastUpdated: new Date().toISOString()
        }, null, 2)
    );
    
    return true;
}

/**
 * Remove a network configuration
 * 
 * @param {string} id - Network identifier to remove
 * @returns {Promise<boolean>} Success status
 */
async function removeNetwork(id) {
    if (!id || typeof id !== 'string') {
        throw new Error('Invalid network ID');
    }
    
    // Cannot remove ethereum
    if (id.toLowerCase() === 'ethereum') {
        throw new Error('Cannot remove the default Ethereum network');
    }
    
    // Load existing networks
    const networks = await getNetworks();
    
    // Check if network exists in custom configs
    if (!networks[id.toLowerCase()]) {
        throw new Error(`Network '${id}' not found`);
    }
    
    // Remove the network
    delete networks[id.toLowerCase()];
    
    // Save the updated configuration
    await fs.writeFile(
        NETWORKS_FILE, 
        JSON.stringify({ 
            networks, 
            lastUpdated: new Date().toISOString() 
        }, null, 2)
    );
    
    return true;
}

/**
 * Get details for a specific network
 * 
 * @param {string} id - Network identifier
 * @returns {Promise<Object|null>} Network configuration or null if not found
 */
async function getNetwork(id) {
    if (!id || typeof id !== 'string') {
        return DEFAULT_NETWORKS.ethereum;
    }
    
    const networks = await getNetworks();
    return networks[id.toLowerCase()] || null;
}

/**
 * Get example networks that can be added
 * 
 * @returns {Array} Array of network identifiers that can be added
 */
async function getAvailableNetworks() {
    const networks = await getNetworks();
    return Object.keys(EXTENDED_NETWORKS).filter(id => !networks[id]);
}

export { 
    getNetworks, 
    getNetwork, 
    addNetwork, 
    removeNetwork, 
    initNetworkConfig,
    getAvailableNetworks,
    DEFAULT_NETWORKS,
    EXTENDED_NETWORKS
}; 