/* eslint-disable prefer-const */
import { BigDecimal, Address } from "@graphprotocol/graph-ts/index";
import { Pair, Token, Bundle } from "../generated/schema";
import { ZERO_BD, factoryContract, ADDRESS_ZERO, ONE_BD } from "./utils";

let WBNB_ADDRESS = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
let BUSD_DESIRE_PAIR = "0x8b0ad45437c5b7d923e67a305c2b0fe178683f7b";
let DESIRE_WBNB_PAIR = "0xd3cbd6eeaed5b7a6f873c323107ae2aa2d640055";
let TASTE_WBNB_PAIR = "0x92b52d1b7a07ed3b4456259cfa42a4fbe9dde4b2";
let DESIRE_ADDRESS = "0xc8846b0877cec21336ba3136208fd02d42ac7b5e";
let TASTE_ADDRESS = "0xdb238123939637d65a03e4b2b485650b4f9d91cb";

export function getBnbPriceInUSD(): BigDecimal {
  // fetch eth prices for each stablecoin
  let busdDesirePair = Pair.load(BUSD_DESIRE_PAIR);
  let desireWbnbPair = Pair.load(DESIRE_WBNB_PAIR);

  if (busdDesirePair !== null && desireWbnbPair !== null) {
    let busdDesirePair_reservedDesire = busdDesirePair.reserve0;
    let busdDesirePair_reservedBusd = busdDesirePair.reserve1;

    let desireWbnbPair_reservedWbnb = desireWbnbPair.reserve0;
    let desireWbnbPair_reservedDesire = desireWbnbPair.reserve1;

    if (busdDesirePair_reservedBusd.notEqual(ZERO_BD) && desireWbnbPair_reservedWbnb.notEqual(ZERO_BD)) {
      let desireWeight = busdDesirePair_reservedDesire.div(desireWbnbPair_reservedDesire);
      let busdWbnbWeight = busdDesirePair_reservedBusd.div(desireWbnbPair_reservedWbnb);
      return desireWeight.times(busdWbnbWeight);
    } else {
      return ZERO_BD;
    }
  } else {
    return ZERO_BD;
  }
}

// token where amounts should contribute to tracked volume and liquidity
let WHITELIST: string[] = [
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // WBNB
  "0xe9e7cea3dedca5984780bafc599bd69add087d56", // BUSD
  "0x55d398326f99059ff775485246999027b3197955", // USDT
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC
  "0x23396cf899ca06c4472205fc903bdb4de249d6fc", // UST
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", // BTCB
  "0x2170ed0880ac9a755fd29b2688956bd959f933f8", // WETH
];

// minimum liquidity for price to get tracked
let MINIMUM_LIQUIDITY_THRESHOLD_BNB = BigDecimal.fromString("0");

/**
 * Search through graph to find derived BNB per token.
 * @todo update to be derived BNB (add stablecoin estimates)
 **/
export function findBnbPerToken(token: Token): BigDecimal {
  if (token.id == WBNB_ADDRESS) {
    return ONE_BD;
  }
  
  // loop through whitelist and check if paired with any
  for (let i = 0; i < WHITELIST.length; ++i) {
    let pairAddress = factoryContract.getPair(Address.fromString(token.id), Address.fromString(WHITELIST[i]));
    if (pairAddress.toHex() != ADDRESS_ZERO) {
      let pair = Pair.load(pairAddress.toHex());
      if (pair.token0 == token.id && pair.reserveBNB.gt(MINIMUM_LIQUIDITY_THRESHOLD_BNB)) {
        let token1 = Token.load(pair.token1);
        return pair.token1Price.times(token1.derivedBNB as BigDecimal); // return token1 per our token * BNB per token 1
      }
      if (pair.token1 == token.id && pair.reserveBNB.gt(MINIMUM_LIQUIDITY_THRESHOLD_BNB)) {
        let token0 = Token.load(pair.token0);
        return pair.token0Price.times(token0.derivedBNB as BigDecimal); // return token0 per our token * BNB per token 0
      }
    } else {
      // calculate in multihops taste/token
      let pairTasteAddress = factoryContract.getPair(Address.fromString(token.id), Address.fromString(TASTE_ADDRESS));
      if (pairTasteAddress.toHex() != ADDRESS_ZERO) {
        let pair = Pair.load(pairTasteAddress.toHex());
        let tasteWbnbPair = Pair.load(TASTE_WBNB_PAIR);
        if (tasteWbnbPair !== null) {
          if (pair.token0 == token.id && pair.reserveBNB.gt(MINIMUM_LIQUIDITY_THRESHOLD_BNB)) {
            return pair.token0Price.times(tasteWbnbPair.token0Price); // return token1 per our token * BNB per token 1
          }
          if (pair.token1 == token.id && pair.reserveBNB.gt(MINIMUM_LIQUIDITY_THRESHOLD_BNB)) {
            return pair.token1Price.times(tasteWbnbPair.token0Price); // return token1 per our token * BNB per token 1
          }
        }
      }

      // calculate in multihops desire/token
      let pairDesireAddress = factoryContract.getPair(Address.fromString(token.id), Address.fromString(DESIRE_ADDRESS));
      if (pairDesireAddress.toHex() != ADDRESS_ZERO) {
        let pair = Pair.load(pairDesireAddress.toHex());
        let desireWbnbPair = Pair.load(DESIRE_WBNB_PAIR);
        if (desireWbnbPair !== null) {
          if (pair.token0 == token.id && pair.reserveBNB.gt(MINIMUM_LIQUIDITY_THRESHOLD_BNB)) {
            return pair.token0Price.times(desireWbnbPair.token0Price); // return token1 per our token * BNB per token 1
          }
          if (pair.token1 == token.id && pair.reserveBNB.gt(MINIMUM_LIQUIDITY_THRESHOLD_BNB)) {
            return pair.token1Price.times(desireWbnbPair.token0Price); // return token1 per our token * BNB per token 1
          }
        }
      }
    }
  }
  return ZERO_BD; // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
  bundle: Bundle,
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let price0 = token0.derivedBNB.times(bundle.bnbPrice);
  let price1 = token1.derivedBNB.times(bundle.bnbPrice);

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1)).div(BigDecimal.fromString("2"));
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0);
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1);
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD;
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(
  bundle: Bundle,
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let price0 = token0.derivedBNB.times(bundle.bnbPrice);
  let price1 = token1.derivedBNB.times(bundle.bnbPrice);

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1));
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString("2"));
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString("2"));
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD;
}
