export function getLoyaltyDiscountPercent(baseAmount) {
  const amount = Number(baseAmount || 0);

  if (!Number.isFinite(amount) || amount < 500) {
    return 0;
  }

  return Math.floor(amount / 500) + 1;
}

export function calculateLoyaltyDiscountAmount(baseAmount) {
  const amount = Number(baseAmount || 0);
  const percent = getLoyaltyDiscountPercent(amount);

  if (percent <= 0) {
    return 0;
  }

  return Number(((amount * percent) / 100).toFixed(2));
}

export function formatDeliveryChargeLabel(orderType, deliveryCharge) {
  const amount = Number(deliveryCharge || 0);

  if (orderType === "DELIVERY" && amount === 0) {
    return "FREE";
  }

  return amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
