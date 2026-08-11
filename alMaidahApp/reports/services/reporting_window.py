from accounts.models import get_operational_settings


def clamp_reporting_window(from_date, to_date):
    settings_row = get_operational_settings()
    baseline = settings_row.reporting_start_date

    if not baseline:
        return from_date, to_date, None

    effective_from = baseline if from_date < baseline else from_date
    effective_to = baseline if to_date < baseline else to_date

    if effective_to < effective_from:
        effective_to = effective_from

    return effective_from, effective_to, baseline
