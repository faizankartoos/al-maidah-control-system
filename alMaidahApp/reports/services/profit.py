from decimal import Decimal

from .cogs import get_cogs_report
from .expenses import get_expenses_report
from .sales import get_sales_report


def get_profit_report(from_date, to_date):
    sales = get_sales_report(from_date, to_date)
    cogs = get_cogs_report(from_date, to_date)
    expenses = get_expenses_report(from_date, to_date)

    revenue = Decimal(str(sales["summary"]["gross_revenue"] or 0))
    total_cogs = Decimal(str(cogs["summary"]["total_cogs"] or 0))
    total_expenses = Decimal(str(expenses["summary"]["total_expenses"] or 0))

    gross_profit = revenue - total_cogs
    net_profit = gross_profit - total_expenses
    profit_margin = (net_profit / revenue * 100) if revenue else Decimal("0.00")
    cogs_ratio = (total_cogs / revenue * 100) if revenue else Decimal("0.00")
    expense_ratio = (total_expenses / revenue * 100) if revenue else Decimal("0.00")

    return {
        "summary": {
            "revenue": revenue,
            "cogs": total_cogs,
            "expenses": total_expenses,
            "gross_profit": gross_profit,
            "net_profit": net_profit,
            "profit_margin": round(profit_margin, 2),
            "cogs_ratio": round(cogs_ratio, 2),
            "expense_ratio": round(expense_ratio, 2),
        },
        "breakdown": {
            "sales_summary": sales["summary"],
            "cogs_summary": cogs["summary"],
            "expenses_summary": expenses["summary"],
        },
    }
