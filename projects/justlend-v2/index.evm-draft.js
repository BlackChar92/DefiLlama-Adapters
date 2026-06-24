// ============================================================================
// DRAFT — NOT the live adapter. DefiLlama loads index.js; this file is ignored.
//
// Multi-chain (Tron + EVM) version of JustLend V2 (= "Moolah", a Morpho Blue fork).
// The Tron logic is identical to the merged official index.js; the EVM additions are
// what's needed once JustLend V2 deploys to an EVM *mainnet*.
//
// Why it isn't live yet:
//   - As of 2026-06, JustLend V2 only exists on EVM on Sepolia *testnet*. DefiLlama
//     doesn't index testnets, and @defillama/sdk has no `sepolia` provider, so a
//     `sepolia` config key can't run in the DefiLlama harness.
//   - The on-chain read logic was fully validated against the real Sepolia Moolah
//     deployment (39 markets discovered via CreateMarket logs; TVL via balanceOf,
//     borrowed = min(borrow, supply) — all correct). See the `// SEPOLIA (validated)`
//     block below for the exact values used.
//
// To go live on an EVM mainnet: uncomment/add that chain in `config` with the real
//   `morphoBlue` (= MoolahProxy) address + deployment `fromBlock`, then rename this
//   file over index.js (or merge the EVM config into it).
// ============================================================================

const sdk = require('@defillama/sdk')
const { getLogs } = require("../helper/cache/getLogs");
const abi = require("../helper/abis/morpho.json");
const { sumTokens2 } = require("../helper/unwrapLPs");

const config = {
  // --- Tron mainnet (live, matches official index.js) ---
  tron: {
    morphoBlue: "TDH4dhmVQQNc1ZNudJwWzBcs2h6ahhWrpp",
    fromBlock: 81622428,
    // Mirrors the official index.js hard-coded skip in borrowed(). The address is the
    //   "GMORPHO" token contract on Base (decimals 18); on Tron it has no code/account.
    //   It is a 0x EVM address, while the sdk returns Tron tokens as base58 T..., so this
    //   entry matches nothing on Tron and is inert here — kept only for parity with the
    //   live adapter. If JustLend V2 launches on Base, this exclusion would belong in the
    //   base config's blackList, where it would actually fire.
    blackList: ["0xda1c2c3c8fad503662e41e324fc644dc2c5e0ccd"],
    blacklistedMarketIds: [],
  },

  // --- EVM mainnet: FILL IN WHEN DEPLOYED ---
  // ethereum: {                       // or bsc / arbitrum / etc — use the DefiLlama chain key
  //   morphoBlue: "0x____",           // MoolahProxy address on that chain
  //   fromBlock: 0,                   // deployment block (or first CreateMarket block)
  //   blackList: [],
  //   blacklistedMarketIds: [],
  // },
  //
  // SEPOLIA (validated 2026-06, testnet only — DO NOT submit, kept for reference):
  //   morphoBlue: "0x13c79ce012b2d5779aa5297848088b3c6b7eb102"  // MoolahProxy
  //   fromBlock:  10237246                                       // first CreateMarket
  //   chainId:    11155111
  //   tokens seen: WETH / WBTC / BTC(test) / USDC / USDT ; 39 markets
}

const eventAbis = {
  createMarket: 'event CreateMarket(bytes32 indexed id, (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams)'
}

// Per-chain cache (the official single global would cross-contaminate once >1 chain runs).
const marketsCache = {}
const getMarket = async (api) => {
  if (!marketsCache[api.chain]) marketsCache[api.chain] = _getMarket(api)
  return marketsCache[api.chain]
}

const _getMarket = async (api) => {
  const { morphoBlue, fromBlock, blacklistedMarketIds = [] } = config[api.chain]
  // Tron uses base58 addresses (need hexify); EVM logs take the raw 0x target as-is.
  const target = api.chain === 'tron' ? sdk.tron.hexifyTarget(morphoBlue) : morphoBlue

  const logs = await getLogs({ api, target, eventAbi: eventAbis.createMarket, fromBlock, onlyArgs: true })

  // Tron-only: getLogs leaves api.block set in a way that breaks subsequent multicalls.
  if (api.chain === 'tron') api.block = null

  return logs.map((i) => i.id.toLowerCase()).filter((id) => !blacklistedMarketIds.includes(id))
}

const tvl = async (api) => {
  const { morphoBlue, blackList = [] } = config[api.chain]
  const markets = await getMarket(api)
  const marketInfos = await api.multiCall({ target: morphoBlue, calls: markets, abi: abi.morphoBlueFunctions.idToMarketParams })
  const tokens = marketInfos.flatMap(({ collateralToken, loanToken }) => [collateralToken, loanToken])
  return sumTokens2({ api, owner: morphoBlue, tokens, blacklistedTokens: blackList, permitFailure: true })
}

const borrowed = async (api) => {
  const { morphoBlue, blackList = [] } = config[api.chain]
  const markets = await getMarket(api)
  const marketInfos = await api.multiCall({ target: morphoBlue, calls: markets, abi: abi.morphoBlueFunctions.idToMarketParams })
  const marketDatas = await api.multiCall({ target: morphoBlue, calls: markets, abi: abi.morphoBlueFunctions.market })
  const blackSet = new Set(blackList.map(b => b.toLowerCase()))

  marketDatas.forEach((data, idx) => {
    const { collateralToken, loanToken } = marketInfos[idx]
    if (blackSet.has(collateralToken.toLowerCase())) return
    if (blackSet.has(loanToken.toLowerCase())) return

    let amount = BigInt(data.totalBorrowAssets || 0)
    const supply = BigInt(data.totalSupplyAssets || 0)
    if (amount > supply) amount = supply // borrow can't exceed supply
    api.add(loanToken, amount.toString())
  })
}

Object.keys(config).forEach((chain) => {
  module.exports[chain] = { tvl, borrowed }
})

module.exports.timetravel = false
