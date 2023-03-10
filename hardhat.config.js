/**
* @type import('hardhat/config').HardhatUserConfig
*/
const dot = require('dotenv').config();
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-web3");
require("@nomiclabs/hardhat-waffle");
const { API_URL_MUMBAI, API_URL_POLYGON, API_URL_GOERLI, API_URL_OPTIGOERLI, API_URL_ARBIGOERLI, API_URL_MOONBEAMALPHA, PRIVATE_KEY, ETHERSCAN_API_KEY, POLYSCAN_API_KEY, OPTISCAN_API_KEY, ARBISCAN_API_KEY, MOONBEAM_API_KEY } = process.env;

task("flat", "Flattens and prints contracts and their dependencies (Resolves licenses)")
  .addOptionalVariadicPositionalParam("files", "The files to flatten", undefined, types.inputFile)
  .setAction(async ({ files }, hre) => {
    let flattened = await hre.run("flatten:get-flattened-sources", { files });
    
    // Remove every line started with "// SPDX-License-Identifier:"
    flattened = flattened.replace(/SPDX-License-Identifier:/gm, "License-Identifier:");
    flattened = `// SPDX-License-Identifier: MIXED\n\n${flattened}`;

    // Remove every line started with "pragma experimental ABIEncoderV2;" except the first one
    flattened = flattened.replace(/pragma experimental ABIEncoderV2;\n/gm, ((i) => (m) => (!i++ ? m : ""))(0));
    console.log(flattened);
  });

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.2",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000
          }
        }
      },
      {
        version: "0.8.15",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000
          }
        }
      },
      {
        version: "0.4.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000
          }
        }
      }
    ] 
},
  defaultNetwork: "mumbai",
  networks: {
    hardhat: {
      accounts: [{ privateKey: `0x${PRIVATE_KEY}`, balance: "10000000000000000000000"}],
      forking: {
        url: process.env.API_URL_POLYGON,
        blockNumber: 25689025  // assumes polygon fork
      },
      loggingEnabled: true,
      gasMultiplier: 7,
      gasPrice: 1000000000 * 5,
      blockGasLimit: 0x1fffffffffffff
    },
    goerli: {
      url: process.env.API_URL_GOERLI,
      accounts: [`0x${PRIVATE_KEY}`],
      gasMultiplier: 10,
      gasPrice: 1000000000 * 10,
      blockGasLimit: 0x1fffffffffffff
    },
    "optimism-goerli": {
      url: API_URL_OPTIGOERLI,
      accounts: [`0x${PRIVATE_KEY}`],
      gasMultiplier: 10,
      gasPrice: 1000000000 * 10,
      blockGasLimit: 0x1fffffffffffff
    },
    arbitrumgoerli: {
      url: API_URL_ARBIGOERLI,
      accounts: [`0x${PRIVATE_KEY}`],
      gasMultiplier: 10,
      gasPrice: 1000000000 * 10,
      blockGasLimit: 0x1fffffffffffff
    },
    mumbai: {
      url: API_URL_MUMBAI,
      accounts: [`0x${PRIVATE_KEY}`],
      gasPrice: 1000000000 * 40
    },
    polygon: {
      url: API_URL_POLYGON,
      accounts: [`0x${PRIVATE_KEY}`]
    },
    "moonbeam-alpha": {
      url: API_URL_MOONBEAMALPHA,
      accounts: [`0x${PRIVATE_KEY}`],
      gasPrice: 1000000000 * 40
    }
  },
   etherscan: {
    apiKey: {
      goerli: ETHERSCAN_API_KEY,
      polygon: POLYSCAN_API_KEY,
      polygonMumbai: POLYSCAN_API_KEY,
      "optimism-goerli": OPTISCAN_API_KEY,
      arbitrumgoerli: ARBISCAN_API_KEY,
      "moonbeam-alpha": MOONBEAM_API_KEY
    },
    customChains: [
      {
        network: "optimism-goerli",
        chainId: 420,
        urls: {
          apiURL: "https://api-goerli-optimism.etherscan.io/api",
          browserURL: "https://goerli-optimism.etherscan.io/"
        }
      },
      {
        network: "arbitrumgoerli",
        chainId: 421613,
        urls: {
          apiURL: "https://api-goerli.arbiscan.io/api",
          browserURL: "https://goerli.arbiscan.io/"
        }
      },
      {
        network: "moonbeam-alpha",
        chainId: 1287,
        urls: {
          apiURL: "https://api-moonbase.moonscan.io/api",
          browserURL: "https://moonbase.moonscan.io/"
        }
      }
    ]
  }
}

// npx hardhat verify --network goerli 0x