import { getSelectedChain, getChainById } from '../../utils/chains.js';
import { verificationService } from '../../core/verification.js';
import {
  saveContractAnalysis,
  saveContractFile,
  saveAnalysisSummary,
} from '../../utils/storage.js';
import { ethers } from 'ethers'; // For address validation
import chalk from 'chalk'; // Import chalk
import { table } from 'table'; // Import table
import { blockExplorerService } from '../../core/blockExplorer.js'; // Need this service now

/**
 * Handles the 'analyze' command.
 * @param {string} address - The contract address provided.
 * @param {object} options - Command options (e.g., { chain: '1' }).
 */
export async function analyzeContract(address, options) {
  console.log(`
🔍 Starting analysis for contract: ${address}`);

  // Validate address format
  if (!ethers.isAddress(address)) {
    console.error(`❌ Invalid Ethereum address format: ${address}`);
    process.exit(1);
  }
  const lowerCaseAddress = address.toLowerCase();

  let targetChain;
  try {
    if (options.chain) {
      targetChain = await getChainById(options.chain);
      if (!targetChain) {
        console.error(`❌ Chain ID ${options.chain} not found in configuration.`);
        process.exit(1);
      }
      console.log(`-- Using specified chain: ${targetChain.name} (ID: ${targetChain.id})`);
    } else {
      targetChain = await getSelectedChain();
      if (!targetChain) {
        console.error(
          "❌ No chain selected or default chain not found. Use 'cana chains set <chainId>' or specify with -c."
        );
        process.exit(1);
      }
      console.log(`-- Using default chain: ${targetChain.name} (ID: ${targetChain.id})`);
    }
  } catch (error) {
    console.error(`❌ Error determining target chain: ${error.message}`);
    process.exit(1);
  }

  // Use the verification service
  let analysisResult = {};
  const filesSaved = {};

  try {
    const result = await verificationService.getVerificationData(lowerCaseAddress, targetChain);
    analysisResult = result;

    // Clearer separation for logging vs saving logic
    const { status, source, data, deployment, error } = analysisResult;
    const { metadata, abi, sourceCode } = data || {};
    const { blockNumber, txHash, source: deploymentSource } = deployment || {};

    // --- Log Deployment Info --- 
    if (blockNumber) {
      console.log(chalk.blue(`-- Deployment Block: ${blockNumber} (Source: ${deploymentSource})`));
    }
    if (txHash) {
      console.log(chalk.blue(`-- Deployment Tx:    ${txHash} (Source: ${deploymentSource})`));
    }
    if (deploymentSource === 'unknown') {
      console.warn(chalk.yellow('-- Could not determine deployment information.'));
    }

    // --- Handle Verification Status & Save Files --- 
    let verificationStatusText = 'Unknown';
    let verificationColor = chalk.grey;

    switch (status) {
      case 'full':
        verificationStatusText = `Verified (Full Match) via ${source}`;
        verificationColor = chalk.green;
        if (metadata) {
          await saveContractAnalysis(targetChain.id, lowerCaseAddress, metadata, 'metadata.json');
          filesSaved.metadata = 'metadata.json';
        }
        if (abi) {
          await saveContractFile(
            targetChain.id,
            lowerCaseAddress,
            JSON.stringify(abi, null, 2),
            'abi.json',
          );
          filesSaved.abi = 'abi.json';
        } else {
          console.warn(chalk.yellow('-- ABI not found within Sourcify metadata.'));
        }
        break;
      case 'partial':
        verificationStatusText = `Verified (Partial Match) via ${source}`;
        verificationColor = chalk.yellow;
        if (metadata) {
          await saveContractAnalysis(targetChain.id, lowerCaseAddress, metadata, 'metadata.json');
          filesSaved.metadata = 'metadata.json';
        }
        if (abi) {
          await saveContractFile(
            targetChain.id,
            lowerCaseAddress,
            JSON.stringify(abi, null, 2),
            'abi.json',
          );
          filesSaved.abi = 'abi.json';
        } else {
          console.warn(chalk.yellow('-- ABI not found within Sourcify metadata.'));
        }
        break;
      case 'verified': // ABI from Block Explorer
        verificationStatusText = `ABI Verified via ${source}`;
        verificationColor = chalk.cyan;
        if (abi) {
          await saveContractFile(
            targetChain.id,
            lowerCaseAddress,
            JSON.stringify(abi, null, 2),
            'abi.json',
          );
          filesSaved.abi = 'abi.json';
        }
        if (sourceCode) {
          filesSaved.sourceCode = {}; 
          console.log(chalk.blue('-- Saving source code files from block explorer...'));
          for (const filename in sourceCode) {
            const safeFilename = filename.replace(/\.\.\//g, '');
            if (safeFilename) {
              await saveContractFile(
                targetChain.id,
                lowerCaseAddress,
                sourceCode[filename],
                safeFilename,
              );
              filesSaved.sourceCode[safeFilename] = true;
            }
          }
        } else if (source === 'blockExplorer') {
          console.warn(
            chalk.yellow('-- ABI reported as verified but source code is missing or not fetched.')
          );
        }
        break;
      case 'unverified':
        verificationStatusText = 'Unverified (Sourcify & Block Explorer)';
        verificationColor = chalk.red;
        console.log(chalk.yellow(`ℹ️ Contract appears unverified.`));
        break;
      case 'error':
         verificationStatusText = `Error during verification (Source: ${source})`;
         verificationColor = chalk.red;
         console.error(chalk.red(`❌ Verification failed (Source: ${source}).`), error);
        break;
      default:
         verificationStatusText = `Unexpected Status: ${status}`;
         verificationColor = chalk.red;
         console.error(chalk.red(`❌ Unexpected verification status: ${status}`));
    }

    // --- Fetch and Save Events (if requested) --- 
    if (options.events) {
        console.log(chalk.blue('\n-- Fetching recent event logs...'));
        const recentLogs = await blockExplorerService.getLogs(lowerCaseAddress, targetChain);
        
        if (recentLogs) {
            if (recentLogs.length > 0) {
                await saveContractFile(
                    targetChain.id,
                    lowerCaseAddress,
                    JSON.stringify(recentLogs, null, 2),
                    'events_raw.json',
                );
                filesSaved.events = 'events_raw.json';
                console.log(chalk.blue(`-- Saved ${recentLogs.length} raw event logs to events_raw.json`));
            } else {
                 console.log(chalk.yellow('-- No recent event logs found.'));
            }
        } else {
             console.warn(chalk.yellow('-- Failed to fetch event logs (check API key and explorer URL).'));
        }
    }
    // --- End Event Fetching --- 

    // --- Prepare Summary Table --- 
    const summaryTableData = [
        [chalk.bold('Contract'), chalk.cyan(lowerCaseAddress)],
        [chalk.bold('Chain'), `${targetChain.name} (ID: ${targetChain.id})`],
        [chalk.bold('Verification'), verificationColor(verificationStatusText)],
    ];
    if (blockNumber) {
        summaryTableData.push([chalk.bold('Deploy Block'), `${blockNumber} (${deploymentSource})`]);
    }
     if (txHash) {
        summaryTableData.push([chalk.bold('Deploy Tx'), `${txHash} (${deploymentSource})`]);
    }
     if (filesSaved.metadata) {
        summaryTableData.push([chalk.bold('Metadata File'), filesSaved.metadata]);
    }
     if (filesSaved.abi) {
        summaryTableData.push([chalk.bold('ABI File'), filesSaved.abi]);
    }
     if (filesSaved.sourceCode && Object.keys(filesSaved.sourceCode).length > 0) {
        summaryTableData.push([chalk.bold('Source Files'), Object.keys(filesSaved.sourceCode).join(', ')]);
    }
    if (filesSaved.events) { // Add events file to table
        summaryTableData.push([chalk.bold('Events File'), filesSaved.events]);
    }

    // --- Save Analysis Summary (JSON) --- 
    const summaryData = {
      timestamp: new Date().toISOString(),
      address: lowerCaseAddress,
      chainId: targetChain.id,
      verification: {
        source: source || 'none',
        status: status || 'unknown',
        error: error instanceof Error ? error.message : error || null,
      },
      deployment: {
        blockNumber: blockNumber || null,
        txHash: txHash || null,
        source: deploymentSource || 'unknown',
      },
      filesSaved,
    };
    await saveAnalysisSummary(targetChain.id, lowerCaseAddress, summaryData);
    // --- End Summary --- 

    // --- Display Summary Table --- 
    console.log(chalk.bold('\n--- Analysis Summary ---'));
    console.log(table(summaryTableData));
    // --- End Table --- 

    console.log(chalk.green(`\n✨ Analysis complete for ${lowerCaseAddress} on chain ${targetChain.id}.`));

  } catch (error) {
    console.error(chalk.red(`❌ An unexpected error occurred during analysis: ${error.message}`));
    // Log the stack trace for debugging if needed
    // console.error(error.stack);
    process.exit(1);
  }
} 