import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve path relative to this file's location
const CONFIG_PATH = path.resolve(__dirname, '../../config/chains.json');

let configCache = null;

async function loadConfig() {
  if (configCache) {
    return configCache;
  }
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    configCache = JSON.parse(data);
    return configCache;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`Error: Configuration file not found at ${CONFIG_PATH}`);
      // Optionally create a default config file here
      throw new Error('Configuration file missing.');
    } else {
      console.error(`Error loading configuration from ${CONFIG_PATH}:`, error);
      throw new Error('Failed to load configuration.');
    }
  }
}

async function saveConfig(config) {
  try {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    configCache = config; // Update cache
  } catch (error) {
    console.error(`Error saving configuration to ${CONFIG_PATH}:`, error);
    throw new Error('Failed to save configuration.');
  }
}

export async function getAllChains() {
  const config = await loadConfig();
  return config.chains || {};
}

export async function getChainById(chainId) {
  const config = await loadConfig();
  return config.chains?.[String(chainId)] || null;
}

export async function getSelectedChain() {
  const config = await loadConfig();
  const selectedId = config.selectedChainId;
  if (!selectedId) {
    // Default to Ethereum Mainnet if no selection
    console.warn('No chain selected, defaulting to Ethereum Mainnet (ID: 1)');
    return config.chains?.[String(1)] || null;
  }
  const chain = config.chains?.[String(selectedId)];
  if (!chain) {
    console.error(`Error: Selected chain ID ${selectedId} not found in configuration.`);
    // Optionally, prompt user to select a valid chain or reset default
    return null;
  }
  return chain;
}

export async function setSelectedChain(chainId) {
  const config = await loadConfig();
  if (!config.chains?.[String(chainId)]) {
    throw new Error(`Chain with ID ${chainId} not found in configuration.`);
  }
  config.selectedChainId = Number(chainId);
  await saveConfig(config);
  console.log(`Selected chain set to: ${config.chains[String(chainId)].name} (ID: ${chainId})`);
}

// --- API Key Management (Initial placeholders) ---

export async function getApiKey(chainId) {
  const config = await loadConfig();
  // Simple retrieval for now, might need refinement (e.g., env var overrides)
  return (
    config.apiKeys?.[String(chainId)] ||
    process.env[`EXPLORER_API_KEY_${chainId}`] ||
    process.env.EXPLORER_API_KEY ||
    null
  );
}

export async function saveApiKey(chainId, key) {
  const config = await loadConfig();
  if (!config.chains?.[String(chainId)]) {
    throw new Error(`Cannot save API key: Chain with ID ${chainId} not found.`);
  }
  if (!config.apiKeys) {
    config.apiKeys = {};
  }
  config.apiKeys[String(chainId)] = key;
  await saveConfig(config);
  console.log(`API key saved for chain ID ${chainId}.`);
}

// --- Chain Management ---

/**
 * Adds a new chain configuration.
 * Validates required fields.
 */
export async function addChain(chainConfig) {
  const requiredFields = ['id', 'name', 'shortName', 'explorerApiUrl'];
  const missingFields = requiredFields.filter(field => !chainConfig[field]);

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields for new chain: ${missingFields.join(', ')}`);
  }

  const chainIdStr = String(chainConfig.id);
  const config = await loadConfig();

  if (config.chains[chainIdStr]) {
    console.warn(`Warning: Overwriting existing configuration for chain ID ${chainIdStr}`);
  }

  // Ensure RPC URL is present, even if empty or null
  if (!Object.prototype.hasOwnProperty.call(chainConfig, 'rpcUrl')) {
    chainConfig.rpcUrl = null;
  }
  // Ensure explorerUrl is present, even if empty or null
  if (!Object.prototype.hasOwnProperty.call(chainConfig, 'explorerUrl')) {
    chainConfig.explorerUrl = null;
  }

  config.chains[chainIdStr] = {
    id: Number(chainConfig.id),
    name: chainConfig.name,
    shortName: chainConfig.shortName,
    explorerUrl: chainConfig.explorerUrl,
    explorerApiUrl: chainConfig.explorerApiUrl,
    rpcUrl: chainConfig.rpcUrl,
  };

  await saveConfig(config);
  console.log(`Chain '${chainConfig.name}' (ID: ${chainIdStr}) added successfully.`);
}

/**
 * Removes a chain configuration by its ID.
 */
export async function removeChain(chainId) {
  const chainIdStr = String(chainId);
  const config = await loadConfig();

  if (!config.chains[chainIdStr]) {
    console.warn(`Chain with ID ${chainIdStr} not found. Nothing to remove.`);
    return;
  }

  const chainName = config.chains[chainIdStr].name;
  delete config.chains[chainIdStr];

  // Also remove associated API key if it exists
  if (config.apiKeys && config.apiKeys[chainIdStr]) {
    delete config.apiKeys[chainIdStr];
    console.log(`Removed API key for chain ID ${chainIdStr}.`);
  }

  // Check if the removed chain was the selected one
  if (config.selectedChainId === Number(chainId)) {
    config.selectedChainId = null; // Or set to a default like 1?
    console.warn(`Removed chain was the selected chain. Selection reset.`);
  }

  await saveConfig(config);
  console.log(`Chain '${chainName}' (ID: ${chainIdStr}) removed successfully.`);
} 