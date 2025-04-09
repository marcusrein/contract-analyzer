import * as chainUtils from '../../utils/chains.js';
import { table } from 'table';
import inquirer from 'inquirer';

export function registerChainCommands(program) {
  const chainsCommand = program.command('chains')
    .description('Manage blockchain network configurations');

  // chains list
  chainsCommand
    .command('list')
    .alias('ls')
    .description('List all configured chains')
    .action(async () => {
      try {
        const chains = await chainUtils.getAllChains();
        const selectedChain = await chainUtils.getSelectedChain();
        const chainIds = Object.keys(chains);

        if (chainIds.length === 0) {
          console.log('No chains configured yet. Use "cana chains add".');
          return;
        }

        const tableHeader = ['Selected', 'ID', 'Name', 'Short Name', 'Explorer API URL', 'RPC URL'];
        const tableRows = chainIds.map(id => {
          const chain = chains[id];
          const isSelected = selectedChain && selectedChain.id === chain.id ? '✅' : '';
          return [
            isSelected,
            chain.id,
            chain.name,
            chain.shortName,
            chain.explorerApiUrl || '-',
            chain.rpcUrl || '-',
          ];
        });

        console.log(table([tableHeader, ...tableRows]));
      } catch (error) {
        console.error(`❌ Error listing chains: ${error.message}`);
        process.exit(1);
      }
    });

  // chains set <chainId>
  chainsCommand
    .command('set <chainId>')
    .description('Set the default chain to use for analysis')
    .action(async (chainId) => {
      try {
        await chainUtils.setSelectedChain(chainId);
      } catch (error) {
        console.error(`❌ Error setting chain: ${error.message}`);
        process.exit(1);
      }
    });

  // chains add
  chainsCommand
    .command('add')
    .description('Add a new chain configuration (interactive)')
    .action(async () => {
      try {
        const answers = await inquirer.prompt([
          { type: 'number', name: 'id', message: 'Chain ID:', filter: Number },
          { type: 'input', name: 'name', message: 'Chain Name:' },
          { type: 'input', name: 'shortName', message: 'Short Name (e.g., mainnet, sepolia):' },
          { type: 'input', name: 'explorerApiUrl', message: 'Block Explorer API URL:' },
          { type: 'input', name: 'explorerUrl', message: 'Block Explorer URL (optional):' },
          { type: 'input', name: 'rpcUrl', message: 'RPC URL (optional):' },
        ]);

        // Validation happens within addChain util, but basic check here is ok
        if (!answers.id || !answers.name || !answers.shortName || !answers.explorerApiUrl) {
          console.error('❌ ID, Name, Short Name, and Explorer API URL are required.');
          process.exit(1);
        }

        await chainUtils.addChain(answers);
      } catch (error) {
        // Handle inquirer errors or addChain errors
        if (error.isTtyError) {
          console.error('❌ Prompt could not be rendered in the current environment.');
        } else {
          console.error(`❌ Error adding chain: ${error.message}`);
        }
        process.exit(1);
      }
    });

  // chains remove <chainId>
  chainsCommand
    .command('remove <chainId>')
    .alias('rm')
    .description('Remove a chain configuration by ID')
    .action(async (chainId) => {
      try {
        // Add confirmation step
        const { confirm } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to remove chain ID ${chainId}? This cannot be undone.`,
          default: false,
        }]);
        if (!confirm) {
          console.log('Removal cancelled.');
          return;
        }
        await chainUtils.removeChain(chainId);
      } catch (error) {
        if (error.isTtyError) {
          console.error('❌ Prompt could not be rendered in the current environment.');
        } else {
          console.error(`❌ Error removing chain: ${error.message}`);
        }
        process.exit(1);
      }
    });
} 