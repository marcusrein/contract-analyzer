import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base directory for saving analysis results, relative to project root
const OUTPUT_BASE_DIR = path.resolve(__dirname, '../../contracts-analyzed');

/**
 * Ensures that a directory exists, creating it if necessary.
 * @param {string} dirPath - The path to the directory.
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Ignore EEXIST error (directory already exists)
    if (error.code !== 'EEXIST') {
      console.error(`Failed to create directory ${dirPath}:`, error);
      throw error; // Rethrow other errors
    }
  }
}

/**
 * Saves the analysis results for a contract.
 * @param {string} chainId - The chain ID.
 * @param {string} address - The contract address.
 * @param {object} analysisData - The data object to save.
 * @param {string} filename - The name of the file to save (e.g., 'metadata.json', 'analysis.json'). Defaults to 'analysis.json'.
 */
export async function saveContractAnalysis(
  chainId,
  address,
  analysisData,
  filename = 'analysis.json',
) {
  if (!chainId || !address || !analysisData) {
    console.error('Error saving analysis: Missing chainId, address, or data.');
    return;
  }

  const lowerCaseAddress = address.toLowerCase();
  const dirPath = path.join(OUTPUT_BASE_DIR, String(chainId), lowerCaseAddress);
  const filePath = path.join(dirPath, filename);

  try {
    await ensureDirectoryExists(dirPath);
    await fs.writeFile(filePath, JSON.stringify(analysisData, null, 2), 'utf8');
    console.log(`Analysis data saved to: ${filePath}`);
  } catch (error) {
    console.error(`Failed to save analysis data for ${address} on chain ${chainId}:`, error);
    // Consider how to handle partial saves or errors more gracefully
  }
}

/**
 * Saves arbitrary data (like ABI or source code) to a file within the contract's analysis directory.
 * @param {string} chainId - The chain ID.
 * @param {string} address - The contract address.
 * @param {string} content - The string content to save.
 * @param {string} filename - The name of the file (e.g., 'abi.json', 'source.sol').
 */
export async function saveContractFile(chainId, address, content, filename) {
  if (!chainId || !address || !content || !filename) {
    console.error('Error saving file: Missing chainId, address, content, or filename.');
    return;
  }

  const lowerCaseAddress = address.toLowerCase();
  const dirPath = path.join(OUTPUT_BASE_DIR, String(chainId), lowerCaseAddress);
  const filePath = path.join(dirPath, filename);

  try {
    await ensureDirectoryExists(dirPath);
    await fs.writeFile(filePath, content, 'utf8');
    console.log(`File saved to: ${filePath}`);
  } catch (error) {
    console.error(`Failed to save file ${filename} for ${address} on chain ${chainId}:`, error);
  }
}

/**
 * Saves a summary of the analysis verification process.
 * @param {string|number} chainId - The chain ID.
 * @param {string} address - The contract address.
 * @param {object} summaryData - The summary data object.
 */
export async function saveAnalysisSummary(chainId, address, summaryData) {
  if (!chainId || !address || !summaryData) {
    console.error('Error saving summary: Missing chainId, address, or data.');
    return;
  }

  const lowerCaseAddress = address.toLowerCase();
  const dirPath = path.join(OUTPUT_BASE_DIR, String(chainId), lowerCaseAddress);
  const filePath = path.join(dirPath, 'analysis_summary.json');

  try {
    await ensureDirectoryExists(dirPath);
    await fs.writeFile(filePath, JSON.stringify(summaryData, null, 2), 'utf8');
    // No console log here to avoid redundancy after main analysis messages
  } catch (error) {
    console.error(`Failed to save analysis summary for ${address} on chain ${chainId}:`, error);
  }
}

// Maybe add functions later to read analysis data if needed
// export async function readContractAnalysis(chainId, address) { ... } 