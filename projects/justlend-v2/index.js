const { getConfig } = require('../helper/cache')

const API_URL = 'https://apitest-v2-1.justlend.org/index/vault/list';

const TOKEN_MAPPING = {
  'TSkW3KiyHNbS9ozn99PHZz6rz1V2DMBFVa': 'bitcoin',
  'TPYwAC9Y4uUcT2QH3WPPjqxzJSJWymMoMS': 'tether',
  'THfS8gUDH5Cx1FnwvdQ2QfBdCHyeNDaKzs': 'usdd',
  'TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a': 'tron',
  'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR': 'tron', // WTRX
  'TZ8du1HkatTWDbS6FLZei4dQfjfpSm9mxp': 'staked-trx', // sTRX
  'TQuaRvcTVquWNKWGiA4zVgcy1ChXNX7p54': 'wrapped-staked-usdt', // wstUSDT
};

async function getV2Data() {
  return (await getConfig('justlend-v2', API_URL)).data;
}

function getMarkets(vault) {
  if (!vault.markets) return [];
  if (Array.isArray(vault.markets)) return vault.markets;
  if (vault.markets.markets) {
    return Array.isArray(vault.markets.markets) ? vault.markets.markets : [vault.markets.markets];
  }
  return [];
}

async function tvl(api) {
  const data = await getV2Data();
  const processedMarketIds = new Set();

  if (data.allVaults && data.allVaults.list) {
    const vaults = Array.isArray(data.allVaults.list) ? data.allVaults.list : [data.allVaults.list];

    vaults.forEach(vault => {
      const marketList = getMarkets(vault);

      marketList.forEach(market => {
        if (market.id && processedMarketIds.has(market.id)) {
          return;
        }
        if (market.id) {
          processedMarketIds.add(market.id);
        }

        const supplyAddress = market.borrowAddress;
        const supplyGeckoId = TOKEN_MAPPING[supplyAddress];
        const supplyAmount = Number(market.totalSupplyAssets);

        if (supplyGeckoId && supplyAmount > 0) {
          api.addCGToken(supplyGeckoId, supplyAmount);
        } else if (supplyAddress && supplyAmount > 0) {
          if (market.totalSupplyAssetsUSD) {
            api.addCGToken('tether', Number(market.totalSupplyAssetsUSD));
          }
        }

        const collateralAddress = market.collateralAddress;
        const collateralGeckoId = TOKEN_MAPPING[collateralAddress];
        const collateralAmount = Number(market.totalCollateralAssets);

        if (collateralGeckoId && collateralAmount > 0) {
          api.addCGToken(collateralGeckoId, collateralAmount);
        } else if (collateralAddress && collateralAmount > 0) {
          if (market.totalCollateralAssetsUSD) {
            api.addCGToken('tether', Number(market.totalCollateralAssetsUSD));
          }
        }
      });
    });
  }
}

async function borrowed(api) {
  const data = await getV2Data();
  const processedMarketIds = new Set();

  if (data.allVaults && data.allVaults.list) {
    const vaults = Array.isArray(data.allVaults.list) ? data.allVaults.list : [data.allVaults.list];

    vaults.forEach(vault => {
      const marketList = getMarkets(vault);

      marketList.forEach(market => {
        if (market.id && processedMarketIds.has(market.id)) {
          return;
        }
        if (market.id) {
          processedMarketIds.add(market.id);
        }

        const assetAddress = market.borrowAddress;
        const geckoId = TOKEN_MAPPING[assetAddress];

        const amount = Number(market.totalBorrowAssets);

        if (geckoId && amount > 0) {
          api.addCGToken(geckoId, amount);
        } else if (assetAddress && amount > 0) {
          if (market.totalBorrowAssetsUSD) {
            api.addCGToken('tether', Number(market.totalBorrowAssetsUSD));
          }
        }
      });
    });
  }
}

module.exports = {
  timetravel: false,
  misrepresentedTokens: true,
  tron: { tvl, borrowed },
};