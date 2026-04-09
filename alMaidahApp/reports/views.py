from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .serializers import (
    DashboardReportSerializer,
    DateRangeSerializer,
    SalesReportSerializer,
    CogsReportSerializer,
    ExpensesReportSerializer,
    ProfitReportSerializer,
    InventoryConsumptionRequestSerializer,
    InventoryConsumptionReportSerializer,
)

from .services.dashboard import get_dashboard_report
from .services.sales import get_sales_report
from .services.cogs import get_cogs_report
from .services.expenses import get_expenses_report
from .services.profit import get_profit_report
from .services.inventory_consumption import get_inventory_consumption_report


class DashboardReportAPIView(APIView):
    def get(self, request):
        date_serializer = DateRangeSerializer(data=request.query_params)
        date_serializer.is_valid(raise_exception=True)

        data = date_serializer.validated_data
        report = get_dashboard_report(
            data["from_date"],
            data["to_date"],
        )

        serializer = DashboardReportSerializer(report)
        return Response(serializer.data, status=status.HTTP_200_OK)

class SalesReportAPIView(APIView):
    def get(self, request):
        date_serializer = DateRangeSerializer(data=request.query_params)
        date_serializer.is_valid(raise_exception=True)

        data = date_serializer.validated_data

        report = get_sales_report(
            data["from_date"],
            data["to_date"]
        )

        serializer = SalesReportSerializer(report)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
class CogsReportAPIView(APIView):
    def get(self, request):
        date_serializer = DateRangeSerializer(data=request.query_params)
        date_serializer.is_valid(raise_exception=True)

        data = date_serializer.validated_data

        report = get_cogs_report(
            data["from_date"],
            data["to_date"]
        )

        serializer = CogsReportSerializer(report)
        return Response(serializer.data)
    
class ExpensesReportAPIView(APIView):
    def get(self, request):
        date_serializer = DateRangeSerializer(data=request.query_params)
        date_serializer.is_valid(raise_exception=True)

        data = date_serializer.validated_data

        report = get_expenses_report(
            data["from_date"],
            data["to_date"]
        )

        serializer = ExpensesReportSerializer(report)
        return Response(serializer.data)
    

class ProfitReportAPIView(APIView):
    def get(self, request):
        date_serializer = DateRangeSerializer(data=request.query_params)
        date_serializer.is_valid(raise_exception=True)

        data = date_serializer.validated_data

        report = get_profit_report(
            data["from_date"],
            data["to_date"]
        )

        serializer = ProfitReportSerializer(report)
        return Response(serializer.data)


class InventoryConsumptionReportAPIView(APIView):
    def get(self, request):
        params = InventoryConsumptionRequestSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)

        data = params.validated_data
        report = get_inventory_consumption_report(
            data["from_date"],
            data["to_date"],
            data["product"],
        )

        serializer = InventoryConsumptionReportSerializer(report)
        return Response(serializer.data)
