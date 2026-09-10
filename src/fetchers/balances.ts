import { ethers } from "ethers";
import { TokenConfig, WalletConfig, TokenBalance } from "../types";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

/**
 * Fetch ERC20 or native ETH balance for a single wallet + token combination.
 */
export async function fetchTokenBalance(
  provider: ethers.JsonRpcProvider,
  wallet: WalletConfig,
  token: TokenConfig,
  currentPriceUsd: number
): Promise<TokenBalance> {
  let rawBalance: bigint;

  if (token.address.toLowerCase() === "native") {
    rawBalance = await provider.getBalance(wallet.address);
  } else {
    const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
    rawBalance = await contract.balanceOf(wallet.address);
  }

  const formattedBalance = Number(
    ethers.formatUnits(rawBalance, token.decimals)
  );

  return {
    token,
    wallet,
    rawBalance,
    formattedBalance,
    currentPriceUsd,
    valueUsd: formattedBalance * currentPriceUsd,
  };
}

/**
 * Fetch balances for all wallet + token combinations.
 */
export async function fetchAllBalances(
  provider: ethers.JsonRpcProvider,
  wallets: WalletConfig[],
  tokens: TokenConfig[],
  currentPrices: Map<string, number>
): Promise<TokenBalance[]> {
  const balances: TokenBalance[] = [];

  for (const wallet of wallets) {
    for (const token of tokens) {
      const price = currentPrices.get(token.coingeckoId) ?? 0;
      const balance = await fetchTokenBalance(provider, wallet, token, price);

      // Skip dust balances (< $0.01)
      if (balance.valueUsd >= 0.01) {
        balances.push(balance);
      }
    }
  }

  return balances;
}
