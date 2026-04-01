from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .models import ExpenseCategory
from .serializers import (
    ExpenseCategorySerializer,
    ExpenseSerializer
)
from .services import (
    create_expense,
    get_expenses_dashboard,
    list_expense_categories,
)


class ExpenseCategoryListCreateView(APIView):
    def get(self, request):
        include_inactive = str(request.query_params.get("include_inactive", "")).lower() in {
            "1",
            "true",
            "yes",
        }
        categories = list_expense_categories(include_inactive=include_inactive)
        serializer = ExpenseCategorySerializer(categories, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = ExpenseCategorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED
        )


class ExpenseCategoryDetailView(APIView):
    def patch(self, request, category_id):
        category = get_object_or_404(ExpenseCategory, id=category_id)
        serializer = ExpenseCategorySerializer(
            category,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class ExpenseListCreateView(APIView):
    def get(self, request):
        dashboard = get_expenses_dashboard(request.query_params)
        return Response(dashboard)

    def post(self, request):
        serializer = ExpenseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        expense = create_expense(serializer.validated_data)

        return Response(
            ExpenseSerializer(expense).data,
            status=status.HTTP_201_CREATED
        )
