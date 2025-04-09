import inquirer from 'inquirer';
import * as chainUtils from '../../utils/chains.js';

/**
 * Handles the interactive setup command.
 * Guides the user through adding API keys for configured chains.
 */
export async function setupCommand() {
  console.log('\n--- Contract Analyzer Setup ---\n');
  console.log('Verification primarily uses Sourcify (no API key needed).');
  console.log('API keys are only used for the block explorer fallback if Sourcify fails.');
  console.log('This setup configures keys for that fallback mechanism.');
  console.log('Get keys from Etherscan, PolygonScan, etc.\n');

  try {
    const chains = await chainUtils.getAllChains();
    const chainIds = Object.keys(chains);

    if (chainIds.length === 0) {
      console.log('No chains configured yet. Please add a chain first using "cana chains add".');
      return;
    }

    const questions = [];
    for (const chainId of chainIds) {
      const chain = chains[chainId];
      const currentKey = await chainUtils.getApiKey(chainId); // Check if key already exists
      questions.push({
        type: 'password',
        name: `apiKey_${chainId}`,
        message: `Enter API key for ${chain.name} (${chain.explorerApiUrl || 'No API URL'}) (optional):`,
        mask: '*',
        default: currentKey, // Show if key is already set
      });
    }

    const answers = await inquirer.prompt(questions);

    let keysSaved = 0;
    for (const chainId of chainIds) {
      const keyName = `apiKey_${chainId}`;
      const newKey = answers[keyName];
      const currentKey = await chainUtils.getApiKey(chainId);

      // Only save if the key is new or changed, and not empty
      if (newKey && newKey !== currentKey) {
        await chainUtils.saveApiKey(chainId, newKey);
        keysSaved++;
      } else if (!newKey && currentKey) {
        // If user cleared the key, do nothing (keep existing or unset)
        console.log(`-- API key for chain ${chainId} kept as is (or remains unset).`);
      }
    }

    if (keysSaved > 0) {
      console.log(`\n✅ Successfully saved ${keysSaved} API key(s).`);
    } else {
      console.log('\nNo new API keys were saved.');
    }
    console.log('Setup complete.');

  } catch (error) {
    if (error.isTtyError) {
      console.error('❌ Prompt could not be rendered in the current environment.');
    } else {
      console.error(`❌ An error occurred during setup: ${error.message}`);
    }
    process.exit(1);
  }
} 