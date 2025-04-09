import { sourcifyService } from './sourcify.js';
import { blockExplorerService } from './blockExplorer.js';

class VerificationService {
  /**
   * Attempts to retrieve contract verification data and deployment info.
   * Priority: Sourcify Metadata > Sourcify Deployment Info > Explorer Creation Tx
   *
   * @param {string} address - The contract address.
   * @param {object} chain - The chain configuration object from chains.js.
   * @returns {Promise<object>} A result object with verification status, data, and deployment info:
   *   {
   *     source: 'sourcify' | 'blockExplorer' | 'none',
   *     status: 'full' | 'partial' | 'verified' | 'unverified' | 'error',
   *     data: { abi?: object, metadata?: object },
   *     deployment: { txHash?: string, blockNumber?: number, source: 'sourcify' | 'blockExplorer' | 'unknown' },
   *     error?: Error
   *   }
   */
  async getVerificationData(address, chain) {
    let response = {
      source: 'none',
      status: 'unverified',
      data: {},
      deployment: { source: 'unknown' },
      error: null,
    };

    // 1. Try Sourcify
    console.log(`-- Checking Sourcify for ${address}...`);
    try {
      const sourcifyResult = await sourcifyService.verifyContract(address, chain.id);
      response.source = 'sourcify';

      if (sourcifyResult.match === 'full' || sourcifyResult.match === 'partial') {
        console.log(`-- Found ${sourcifyResult.match} Match on Sourcify.`);
        response.status = sourcifyResult.match;
        response.data.metadata = sourcifyResult.data;
        if (sourcifyResult.data?.output?.abi) {
          response.data.abi = sourcifyResult.data.output.abi;
        }

        const sourcifyDeployment = await sourcifyService.getDeploymentInfo(address, chain.id);
        if (sourcifyDeployment?.txHash || sourcifyDeployment?.blockNumber) {
          console.log('-- Found deployment info via Sourcify metadata.');
          response.deployment = {
            ...sourcifyDeployment,
            source: 'sourcify',
          };
        }
      } else if (sourcifyResult.match === 'error') {
        console.error('-- Sourcify check failed.', sourcifyResult.error);
        response.status = 'error';
        response.error = sourcifyResult.error;
        return response;
      } else {
        console.log('-- No match found on Sourcify.');
        response.source = 'none';
      }
    } catch (sourcifyError) {
      console.error('-- Error during Sourcify check:', sourcifyError);
      response.source = 'sourcify';
      response.status = 'error';
      response.error = sourcifyError;
      return response;
    }

    let fetchedAbiFromExplorer = false;

    // 2. Try Block Explorer Fallback (for ABI)
    if (response.status === 'unverified' || !response.data.abi) {
      console.log('-- Trying Block Explorer fallback for ABI...');
      response.source = 'blockExplorer';
      try {
        const abiString = await blockExplorerService.getAbiFromExplorer(address, chain);
        if (abiString) {
          try {
            response.data.abi = JSON.parse(abiString);
            response.status = 'verified'; // ABI found
            fetchedAbiFromExplorer = true; // Mark that we got ABI from here
            console.log('-- Found ABI via Block Explorer.');
          } catch (parseError) {
            console.error(`-- Failed to parse ABI from block explorer: ${parseError.message}`);
            response.status = 'error';
            response.error = parseError;
          }
        } else {
          console.log('-- No ABI found via Block Explorer.');
          response.source = 'none'; // Reset source if ABI not found
        }
      } catch (explorerError) {
        console.error(`-- Block Explorer ABI fetch failed: ${explorerError.message}`);
        response.status = 'error';
        response.error = explorerError;
      }
    }

    // 2b. Try Block Explorer for Source Code (if ABI came from explorer)
    if (fetchedAbiFromExplorer) {
      console.log('-- Trying Block Explorer fallback for Source Code...');
      try {
        const sources = await blockExplorerService.getSourceCodeFromExplorer(address, chain);
        if (sources) {
          console.log('-- Found Source Code via Block Explorer.');
          response.data.sourceCode = sources; // Add sources to response data
        } else {
          console.log('-- No Source Code found via Block Explorer (though ABI was found).');
        }
      } catch (sourceError) {
        console.error(`-- Block Explorer Source Code fetch failed: ${sourceError.message}`);
      }
    }

    // 3. Try Block Explorer for Deployment Info
    if (response.deployment.source === 'unknown') {
      console.log('-- Attempting to find deployment info via Block Explorer...');
      try {
        const explorerDeployment = await blockExplorerService.getContractCreationTx(address, chain);
        if (explorerDeployment?.txHash || explorerDeployment?.blockNumber) {
          console.log('-- Found potential deployment info via Block Explorer.');
          response.deployment = {
            ...explorerDeployment,
            source: 'blockExplorer',
          };
        } else {
          console.log('-- Could not determine deployment info from Block Explorer.');
        }
      } catch (deploymentError) {
        console.error(`-- Block Explorer deployment fetch failed: ${deploymentError.message}`);
      }
    }

    return response;
  }
}

export const verificationService = new VerificationService(); 