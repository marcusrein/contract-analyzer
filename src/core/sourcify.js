import fetch from 'node-fetch'; // Or use native fetch if Node >= 18

const SOURCIFY_REPO_BASE_URL = 'https://repo.sourcify.dev';

class SourcifyService {
  constructor() {
    // Can add configuration later if needed (e.g., custom Sourcify server)
  }

  async #fetchSourcifyData(url) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        // Check if the content type is JSON before parsing
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        } else {
          // Handle cases where a non-JSON response is OK (e.g., getting raw source files later)
          // For metadata/match checks, we expect JSON.
          console.warn(`Sourcify returned non-JSON response for ${url}`);
          return null;
        }
      } else if (response.status === 404) {
        return null; // Not found is expected
      } else {
        console.error(
          `Sourcify request failed for ${url}: ${response.status} ${response.statusText}`,
        );
        // Consider throwing a specific error type
        throw new Error(`Sourcify request failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`Error fetching from Sourcify URL ${url}:`, error);
      // Rethrow or handle specific network errors
      throw error;
    }
  }

  async getFullMatch(address, chainId) {
    const url = `${SOURCIFY_REPO_BASE_URL}/contracts/full_match/${chainId}/${address}/metadata.json`;
    return await this.#fetchSourcifyData(url);
  }

  async getPartialMatch(address, chainId) {
    const url = `${SOURCIFY_REPO_BASE_URL}/contracts/partial_match/${chainId}/${address}/metadata.json`;
    return await this.#fetchSourcifyData(url);
  }

  /**
   * Verifies a contract against the Sourcify repository.
   * @param {string} address - The contract address.
   * @param {number|string} chainId - The chain ID.
   * @returns {Promise<object>} An object indicating the match type and data:
   *   { match: 'full' | 'partial' | 'none' | 'error', data?: object, error?: Error }
   */
  async verifyContract(address, chainId) {
    try {
      const lowerCaseAddress = address.toLowerCase();

      // 1. Try full match
      const fullMatchData = await this.getFullMatch(lowerCaseAddress, chainId);
      if (fullMatchData) {
        return { match: 'full', data: fullMatchData };
      }

      // 2. Try partial match
      const partialMatchData = await this.getPartialMatch(lowerCaseAddress, chainId);
      if (partialMatchData) {
        return { match: 'partial', data: partialMatchData };
      }

      // 3. No match found
      return { match: 'none' };
    } catch (error) {
      console.error(`Sourcify verification failed for ${address} on chain ${chainId}:`, error);
      return { match: 'error', error: error };
    }
  }

  /**
   * Gets deployment information from Sourcify metadata if available.
   * @param {string} address - Contract address.
   * @param {number|string} chainId - Chain ID.
   * @returns {Promise<object|null>} Deployment info or null.
   */
  async getDeploymentInfo(address, chainId) {
    const result = await this.verifyContract(address, chainId);

    if ((result.match === 'full' || result.match === 'partial') && result.data) {
      // Extract relevant details from metadata
      const metadata = result.data;
      return {
        // Note: Deployment block might not always be present in metadata
        deploymentBlock: metadata.output?.devdoc?.deployment?.blockNumber || null,
        transactionHash: metadata.output?.devdoc?.deployment?.transactionHash || null,
        compilerVersion: metadata.compiler?.version || 'unknown',
        optimization: metadata.settings?.optimizer?.enabled || false,
        optimizationRuns: metadata.settings?.optimizer?.runs || undefined,
        source: result.match, // Indicate if it was full or partial
      };
    }
    return null;
  }
  
  // TODO: Add methods to fetch actual source files if needed
  // async getSourceFile(address, chainId, filePath) { ... }
}

// Export an instance or the class itself depending on preference
export const sourcifyService = new SourcifyService();
// export default SourcifyService; // Alternative export 