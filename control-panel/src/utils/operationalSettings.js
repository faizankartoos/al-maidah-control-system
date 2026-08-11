export function clampDateToReportingStart(value, reportingStartDate) {
  if (!value || !reportingStartDate) {
    return value || "";
  }

  return value < reportingStartDate ? reportingStartDate : value;
}

export function clampDateRangeToReportingStart(fromDate, toDate, reportingStartDate) {
  const nextFromDate = clampDateToReportingStart(fromDate, reportingStartDate);
  let nextToDate = clampDateToReportingStart(toDate, reportingStartDate);

  if (nextFromDate && nextToDate && nextToDate < nextFromDate) {
    nextToDate = nextFromDate;
  }

  return {
    fromDate: nextFromDate,
    toDate: nextToDate,
  };
}

export function buildMonthWindowWithReportingStart(todayValue, reportingStartDate) {
  const monthStart = new Date(todayValue);
  monthStart.setDate(1);

  return clampDateRangeToReportingStart(
    monthStart.toISOString().split("T")[0],
    todayValue,
    reportingStartDate,
  );
}
