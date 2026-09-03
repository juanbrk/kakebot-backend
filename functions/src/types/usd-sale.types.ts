export interface UsdSale {
  id?: string;
  telegramUserId: string;
  amountUSD: number;
  exchangeRate: number;
  /**
   * Derived (amountUSD × exchangeRate) and persisted, so the monthly weighted
   * average is a division of two column sums, not a reduction with multiplication.
   */
  amountARS: number;
  date: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface SaveUsdSaleParams {
  telegramUserId: string;
  amountUSD: number;
  exchangeRate: number;
}
