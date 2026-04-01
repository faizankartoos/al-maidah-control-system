from expenses.services import get_expenses_dashboard


def get_expenses_report(from_date, to_date):
    dashboard = get_expenses_dashboard(
        {
            "start_date": from_date,
            "end_date": to_date,
        }
    )

    return dashboard
