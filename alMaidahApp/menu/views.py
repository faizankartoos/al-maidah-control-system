from django.db.models import Q
from django.db.models.functions import Lower
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Menu
from .serializers import MenuSerializer


def is_truthy(value):
    return str(value).lower() in {"1", "true", "yes"}


class MenuListCreateAPIView(APIView):
    def get(self, request):
        menu_items = Menu.objects.all().order_by(Lower("name"), "id")

        search = request.query_params.get("search", "").strip()
        category = request.query_params.get("category", "").strip()
        is_available = request.query_params.get("is_available")
        available_only = request.query_params.get("available_only")

        if search:
            menu_items = menu_items.filter(
                Q(name__icontains=search) | Q(category__icontains=search)
            )

        if category:
            menu_items = menu_items.filter(category__iexact=category)

        if available_only is not None and is_truthy(available_only):
            menu_items = menu_items.filter(is_available=True)
        elif is_available is not None:
            menu_items = menu_items.filter(is_available=is_truthy(is_available))

        serializer = MenuSerializer(menu_items, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = MenuSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MenuDetailAPIView(APIView):
    def get_object(self, pk):
        try:
            return Menu.objects.get(pk=pk)
        except Menu.DoesNotExist:
            return None

    def get(self, request, pk):
        menu = self.get_object(pk)
        if not menu:
            return Response(
                {"error": "Menu item not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = MenuSerializer(menu)
        return Response(serializer.data)

    def put(self, request, pk):
        menu = self.get_object(pk)
        if not menu:
            return Response(
                {"error": "Menu item not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = MenuSerializer(menu, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def patch(self, request, pk):
        menu = self.get_object(pk)
        if not menu:
            return Response(
                {"error": "Menu item not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = MenuSerializer(menu, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        menu = self.get_object(pk)
        if not menu:
            return Response(
                {"error": "Menu item not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        menu.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
