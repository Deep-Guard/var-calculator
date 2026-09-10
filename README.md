# VaR Calculator

Built by [Deep Guard](https://deepguard.xyz)

A Value at Risk (VaR) calculator for on-chain treasury and LP positions. Point it at any Ethereum wallet or Uniswap v2 LP position and it will produce a professional risk report your team can share with investors or a board.

## What It Does

1. Reads current token and LP balances from the blockchain
2. Fetches historical daily prices from CoinGecko
3. Calculates portfolio returns over your chosen lookback period
4. Computes VaR at configurable confidence levels (95%, 99%) and horizons (1-day, 7-day)
5. Outputs a terminal summary, an HTML report, and/or a JSON data file

For LP positions, it correctly accounts for impermanent loss using the Uniswap v2 constant-product formula when reconstructing historical portfolio value.

## Output

**Terminal**
```
  PORTFOLIO VALUE AT RISK (Historical Simulation)

                  1-Day VaR             7-Day VaR
  ────────────────────────────────────────────────
  95% Confidence  $48,320.00 (4.83%)    $127,891.00 (12.78%)
  99% Confidence  $91,240.00 (9.12%)    $241,540.00 (24.15%)
```

**HTML Report**

A self-contained HTML file with a portfolio summary, asset breakdown, VaR table (portfolio-level and per-asset), a return distribution histogram, and methodology notes.

**JSON**

Machine-readable output of the full report for downstream processing or integration.

## Installation

```bash
git clone https://github.com/Deep-Guard/var-calculator.git
cd var-calculator
npm install
npm run build
```

## Setup

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env`:
```
RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
COINGECKO_API_KEY=           # optional — free tier works without one
```

## Configuration

Create a config JSON file describing your positions. See `examples/` for ready-to-use templates.

```json
{
  "protocolName": "My Protocol Treasury",
  "rpc": "https://mainnet.infura.io/v3/YOUR_KEY",
  "wallets": [
    { "address": "0x...", "label": "Treasury Multisig" }
  ],
  "tokens": [
    {
      "address": "native",
      "symbol": "ETH",
      "coingeckoId": "ethereum",
      "decimals": 18
    },
    {
      "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "symbol": "USDC",
      "coingeckoId": "usd-coin",
      "decimals": 6
    }
  ],
  "var": {
    "confidenceLevels": [0.95, 0.99],
    "lookbackDays": 90,
    "horizons": [1, 7]
  }
}
```

**Adding a Uniswap v2 LP position:**

```json
{
  "lpPositions": [
    {
      "protocol": "uniswap-v2",
      "poolAddress": "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc",
      "walletAddress": "0x...",
      "label": "USDC/ETH Uniswap v2",
      "token0": { "address": "0xA0b...", "symbol": "USDC", "coingeckoId": "usd-coin", "decimals": 6 },
      "token1": { "address": "0xC02...", "symbol": "WETH", "coingeckoId": "ethereum", "decimals": 18 }
    }
  ]
}
```

## Usage

```bash
# Terminal report only
npm run dev -- examples/treasury-config.json

# Terminal + HTML report
npm run dev -- examples/treasury-config.json --html

# Terminal + HTML + JSON
npm run dev -- examples/treasury-config.json --html --json

# Custom output directory
npm run dev -- examples/treasury-config.json --html --output ./my-reports

# After building
./dist/index.js examples/treasury-config.json --html
```

## Methodology

This tool uses **Historical Simulation VaR**:

1. Collect daily portfolio returns over the lookback period
2. Sort returns ascending (worst to best)
3. The return at the `(1 - confidence)` percentile is the 1-day VaR threshold
4. Multi-day VaR is scaled using the square-root-of-time rule: `VaR(T) = VaR(1) × sqrt(T)`

For LP positions, the constant-product formula `(x·y = k)` reconstructs the position value at each historical price point, correctly accounting for impermanent loss.

**Assumptions and limitations:**
- Current wallet balance is used as the fixed position size across the lookback period
- The square-root-of-time scaling assumes independent, identically distributed returns
- Historical VaR does not account for liquidity risk or correlation breakdown under stress
- This is a risk awareness tool, not a substitute for professional risk management

## Rate Limits

The CoinGecko free tier allows approximately 10–30 calls per minute. The tool adds a 2-second delay between price history requests. For portfolios with many assets, get a free API key at coingecko.com to reduce wait times.

## Need a Professional Risk Assessment?

This tool gives a directional picture of your portfolio risk. For a full protocol risk assessment covering economic security, liquidation mechanics, and governance attack surfaces, reach out to Deep Guard.

**Email:** getaudited@deepguard.xyz
**Telegram:** [Message us](https://t.me/KingFavourCreates)
**Website:** https://deepguard.xyz

## Support Open-Source Work

**ETH:** `0xc149EEc98885E700C618360C243dB064D7FcDE3e`
