from ledger.services import record_credit, record_debit
from ledger.utils import get_cash_drawer

from .services import (
    cancel_order,
    ChangeConfirmationRequired,
    collect_payment,
    complete_unpaid_order,
    process_payment,
    update_order_details,
)
from django.db.models import Sum
from django.db import transaction


# Second

from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from decimal import Decimal, InvalidOperation
from django.utils.dateparse import parse_date, parse_datetime
from django.utils import timezone

from .models import Order, OrderItem, OrderPayment
from .serializers import OrderSerializer
from ledger.models import LedgerAccount



class OrderListAPIView(ListAPIView):

    queryset = Order.objects.all().order_by("-created_at")
    serializer_class = OrderSerializer



class OrderDetailAPIView(RetrieveAPIView):

    queryset = Order.objects.all()
    serializer_class = OrderSerializer



class CreateOrderAPIView(APIView):
    required_tabs = ("ORDERS",)

    def _parse_money(self, value, *, default="0.00"):
        if value in [None, "", " ", "null"]:
            return Decimal(default)

        try:
            return Decimal(str(value).strip())
        except (InvalidOperation, TypeError, ValueError):
            raise ValueError("Enter a valid amount")

    def _validate_items(self, items):
        if not isinstance(items, list) or not items:
            raise ValueError("No items in order")

        normalized_items = []

        for index, item in enumerate(items, start=1):
            name = (item.get("name") or "").strip()
            if not name:
                raise ValueError(f"Item {index} is missing a name")

            try:
                qty = int(item.get("qty"))
            except:
                raise ValueError(f"Item {index} has invalid quantity")

            if qty <= 0:
                raise ValueError(f"Item {index} quantity must be > 0")

            try:
                price = Decimal(str(item.get("price")))
            except:
                raise ValueError(f"Item {index} has invalid price")

            if price < 0:
                raise ValueError(f"Item {index} price cannot be negative")

            normalized_items.append({
                "name": name,
                "qty": qty,
                "price": price
            })

        return normalized_items

    def _parse_scheduled_time(self, scheduled_time):
        if not scheduled_time:
            return None

        parsed = parse_datetime(scheduled_time)

        if not parsed:
            raise ValueError("Enter a valid scheduled date and time")

        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed, timezone.get_current_timezone())

        if parsed <= timezone.now():
            raise ValueError("Scheduled time must be in the future")

        return parsed

    def post(self, request):
        data = request.data

        order_type = (data.get("order_type") or "").strip()
        payment_mode = (data.get("payment_mode") or "").strip()
        payment_method = (data.get("payment_method") or "").strip()
        delivery_boy_id = data.get("delivery_boy_id")

        if payment_method == "PAY_LATER" and payment_mode != "PAY_LATER":
            payment_mode = "PAY_LATER"
            payment_method = ""

        if order_type not in {"DINE_IN", "TAKEAWAY", "DELIVERY"}:
            return Response({"error": "Select a valid order type"}, status=400)

        if payment_mode not in {"PAY_NOW", "PAY_LATER"}:
            return Response({"error": "Select a valid payment mode"}, status=400)

        try:
            items = self._validate_items(data.get("items", []))

            discount = self._parse_money(data.get("discount"))
            delivery_charge = self._parse_money(data.get("delivery_charge"))
            payment_amount = Decimal("0.00")
            cash_amount = Decimal("0.00")
            online_amount = Decimal("0.00")

            if payment_mode == "PAY_NOW":
                payment_amount = self._parse_money(data.get("payment_amount"))

                if payment_method == "CASH":
                    cash_amount = payment_amount
                    online_amount = Decimal("0.00")

                elif payment_method == "ONLINE":
                    online_amount = payment_amount
                    cash_amount = Decimal("0.00")

                elif payment_method == "MIXED":
                    cash_amount = self._parse_money(data.get("cash_amount"))
                    online_amount = self._parse_money(data.get("online_amount"))
                    payment_amount = cash_amount + online_amount

                else:
                    raise ValueError("Select a valid payment method")
            else:
                payment_method = None

            guest_count_raw = data.get("guest_count")

        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        table_number = (data.get("table_number") or "").strip() or None
        phone = (data.get("phone") or "").strip() or None
        name = (data.get("name") or "").strip() or None
        address = (data.get("address") or "").strip() or None
        order_note = (data.get("order_note") or "").strip() or None
        deduct_change = bool(data.get("deduct_change"))

        try:
            scheduled_time = self._parse_scheduled_time(data.get("scheduled_time"))
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        # Guest count
        guest_count = None
        if guest_count_raw not in [None, ""]:
            try:
                guest_count = int(guest_count_raw)
                if guest_count <= 0:
                    raise ValueError
            except:
                return Response({"error": "Enter valid guest count"}, status=400)

        if scheduled_time and not phone:
            return Response({"error": "Phone number required for scheduled orders"}, status=400)

        # ---------------- DELIVERY ----------------

        delivery_boy = None

        if order_type == "DELIVERY":
            if not phone:
                return Response({"error": "Phone required"}, status=400)

            if not address:
                return Response({"error": "Address required"}, status=400)

            if not delivery_boy_id:
                return Response({"error": "Select delivery boy"}, status=400)

            try:
                delivery_boy = LedgerAccount.objects.get(
                    id=delivery_boy_id,
                    account_type="DELIVERY"
                )
            except LedgerAccount.DoesNotExist:
                return Response({"error": "Invalid delivery boy"}, status=400)
        else:
            delivery_charge = Decimal("0.00")

        # Normalize fields
        if order_type == "DINE_IN":
            if not scheduled_time:
                phone = None
                name = None
            address = None
            delivery_boy = None

        elif order_type == "TAKEAWAY":
            address = None
            delivery_boy = None
            table_number = None

        else:
            table_number = None

        order_status = "SCHEDULED" if scheduled_time else "PROCESSING"

        # ---------------- CREATE ORDER ----------------

        @transaction.atomic
        def create_order():

            order = Order.objects.create(
                order_type=order_type,
                delivery_boy=delivery_boy,
                table_number=table_number,
                customer_phone=phone,
                customer_name=name,
                delivery_address=address,
                order_note=order_note,
                discount=discount,
                delivery_charge=delivery_charge,
                order_status=order_status,
                scheduled_time=scheduled_time,
                guest_count=guest_count
            )

            for item in items:
                OrderItem.objects.create(
                    order=order,
                    item_name=item["name"],
                    quantity=item["qty"],
                    price=item["price"]
                )

            order.refresh_from_db()
            total = order.total_amount

            # ---------------- PAYMENT RULES ----------------

            if payment_mode == "PAY_LATER":
                if order_type == "DELIVERY" and delivery_boy and order_status != "SCHEDULED":
                    record_debit(
                        account=delivery_boy,
                        amount=total,
                        payment_type="SYSTEM",
                        reference=f"ORDER-{order.id}",
                        description=f"Delivery order assigned #{order.id}"
                    )

                order.payment_status = "UNPAID"
                order.save(update_fields=["payment_status"])
                return order

            # 🚨 NO PARTIAL PAYMENTS
            if payment_amount < total:
                raise ValueError("Cannot accept less than total amount")

            # Change confirmation
            if payment_amount > total and not deduct_change:
                raise ChangeConfirmationRequired(payment_amount - total)

            # Mixed validation
            if payment_method == "MIXED":
                if cash_amount + online_amount != payment_amount:
                    raise ValueError("Cash + Online mismatch")

            # Process payment
            process_payment(
                order,
                payment_amount,
                payment_method,
                cash_amount=cash_amount,
                online_amount=online_amount,
                deduct_change=deduct_change
            )

            return order

        try:
            order = create_order()

        except ChangeConfirmationRequired as exc:
            return Response(
                {
                    "error": f"Deduct remaining {exc.change_amount} from cash drawer?",
                    "requires_change_confirmation": True,
                    "change_amount": str(exc.change_amount),
                },
                status=400
            )

        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        return Response(
            {
                "success": True,
                "order_id": order.id,
                "total": order.total_amount
            },
            status=201
        )
# class CreateOrderAPIView(APIView):
    

#     def _parse_money(self, value, *, default="0.00"):
#         print("STEP 4 - value before Decimal:", value)

#         try:
#             return Decimal(str(value if value is not None else default))
#         except (InvalidOperation, TypeError, ValueError):
#             raise ValueError("Enter a valid amount")

#     def _validate_items(self, items):

#         if not isinstance(items, list) or not items:
#             raise ValueError("No items in order")

#         normalized_items = []

#         for index, item in enumerate(items, start=1):
#             item_name = (item.get("name") or "").strip()

#             if not item_name:
#                 raise ValueError(f"Item {index} is missing a name")

#             try:
#                 quantity = int(item.get("qty"))
#             except (TypeError, ValueError):
#                 raise ValueError(f"Item {index} has an invalid quantity")

#             if quantity <= 0:
#                 raise ValueError(f"Item {index} quantity must be greater than zero")

#             try:
#                 price = Decimal(str(item.get("price")))
#             except (InvalidOperation, TypeError, ValueError):
#                 raise ValueError(f"Item {index} has an invalid price")

#             if price < 0:
#                 raise ValueError(f"Item {index} price cannot be negative")

#             normalized_items.append({
#                 "name": item_name,
#                 "qty": quantity,
#                 "price": price,
#             })

#         return normalized_items

#     def _parse_scheduled_time(self, scheduled_time):

#         if not scheduled_time:
#             return None

#         parsed = parse_datetime(scheduled_time)

#         if not parsed:
#             raise ValueError("Enter a valid scheduled date and time")

#         if timezone.is_naive(parsed):
#             parsed = timezone.make_aware(parsed, timezone.get_current_timezone())

#         if parsed <= timezone.now():
#             raise ValueError("Scheduled time must be in the future")

#         return parsed

#     def post(self, request):
#         data = request.data
#         print("STEP 3 - RAW payment_amount:", request.data.get("payment_amount"))
#         order_type = data.get("order_type")
#         payment_mode = data.get("payment_mode")
#         payment_method = data.get("payment_method")
#         delivery_boy_id = data.get("delivery_boy_id")

#         try:
#             items = self._validate_items(data.get("items", []))
#             discount = self._parse_money(data.get("discount"), default="0.00")
#             delivery_charge = self._parse_money(data.get("delivery_charge"), default="0.00")
#             guest_count_raw = data.get("guest_count")
#         except ValueError as exc:
#             return Response({"error": str(exc)}, status=400)

#         if order_type not in {"DINE_IN", "TAKEAWAY", "DELIVERY"}:
#             return Response({"error": "Select a valid order type"}, status=400)

#         if payment_mode not in {"PAY_LATER", "PAY_NOW"}:
#             return Response({"error": "Select a valid payment mode"}, status=400)

#         table_number = (data.get("table_number") or "").strip() or None
#         phone = (data.get("phone") or "").strip() or None
#         name = (data.get("name") or "").strip() or None
#         address = (data.get("address") or "").strip() or None
#         order_note = (data.get("order_note") or "").strip() or None
#         deduct_change = bool(data.get("deduct_change"))

#         try:
#             scheduled_time = self._parse_scheduled_time(data.get("scheduled_time"))
#         except ValueError as exc:
#             return Response({"error": str(exc)}, status=400)

#         guest_count = None

#         if guest_count_raw not in [None, ""]:
#             try:
#                 guest_count = int(guest_count_raw)
#             except (TypeError, ValueError):
#                 return Response({"error": "Enter a valid guest count"}, status=400)

#             if guest_count <= 0:
#                 return Response({"error": "Guest count must be greater than zero"}, status=400)

#         if scheduled_time and not phone:
#             return Response({"error": "Phone number required for scheduled orders"}, status=400)

#         if order_type == "TAKEAWAY" and not phone:
#             return Response({"error": "Phone number required for takeaway order"}, status=400)

#         delivery_boy = None

#         if order_type == "DELIVERY":
#             if not phone:
#                 return Response({"error": "Phone number required for delivery order"}, status=400)

#             if not address:
#                 return Response({"error": "Address required for delivery order"}, status=400)

#             if not delivery_boy_id:
#                 return Response({"error": "Select a delivery boy"}, status=400)

#             try:
#                 delivery_boy = LedgerAccount.objects.get(
#                     id=delivery_boy_id,
#                     account_type="DELIVERY"
#                 )
#             except LedgerAccount.DoesNotExist:
#                 return Response({"error": "Invalid delivery boy"}, status=400)
#         else:
#             delivery_charge = Decimal("0.00")

#         if order_type == "DINE_IN":
#             if not scheduled_time:
#                 phone = None
#                 name = None
#             address = None
#             delivery_boy = None
#             delivery_charge = Decimal("0.00")
#         elif order_type == "TAKEAWAY":
#             address = None
#             delivery_boy = None
#             delivery_charge = Decimal("0.00")
#             table_number = None
#         else:
#             table_number = None

#         stored_order_type = order_type
#         order_status = "SCHEDULED" if scheduled_time else "PROCESSING"

#         @transaction.atomic
#         def create_order():

#             order = Order.objects.create(
#                 order_type=stored_order_type,
#                 delivery_boy=delivery_boy,
#                 table_number=table_number,
#                 customer_phone=phone,
#                 customer_name=name,
#                 delivery_address=address,
#                 order_note=order_note,
#                 discount=discount,
#                 delivery_charge=delivery_charge,
#                 order_status=order_status,
#                 scheduled_time=scheduled_time,
#                 guest_count=guest_count
#             )

#             for item in items:
#                 OrderItem.objects.create(
#                     order=order,
#                     item_name=item["name"],
#                     quantity=item["qty"],
#                     price=item["price"]
#                 )

#             order.refresh_from_db()
#             total = order.total_amount

#             def assign_delivery_boy_balance(amount_to_collect):
#                 if (
#                     order.order_type == "DELIVERY"
#                     and order.delivery_boy
#                     and amount_to_collect > 0
#                 ):
#                     record_debit(
#                         account=order.delivery_boy,
#                         amount=amount_to_collect,
#                         payment_type="SYSTEM",
#                         reference=f"ORDER-{order.id}",
#                         description=f"Delivery order assigned #{order.id}"
#                     )

#             if payment_mode == "PAY_LATER":
#                 order.payment_status = "UNPAID"
#                 order.save(update_fields=["payment_status"])
#                 if order_status != "SCHEDULED":
#                     assign_delivery_boy_balance(total)
#                 return order

#             if payment_method not in {"CASH", "ONLINE", "MIXED"}:
#                 raise ValueError("Select a valid payment method")

#             try:
#                 process_payment(
#                     order,
#                     payment_amount,
#                     payment_method,
#                     cash_amount=cash_amount,
#                     online_amount=online_amount,
#                     deduct_change=deduct_change
#                 )
#             except ChangeConfirmationRequired:
#                 raise
#             except ValueError as exc:
#                 raise ValueError(str(exc))

#             return order

#         try:
#             order = create_order()
#         except ChangeConfirmationRequired as exc:
#             return Response(
#                 {
#                     "error": f"Deduct remaining {exc.change_amount} from cash drawer?",
#                     "requires_change_confirmation": True,
#                     "change_amount": str(exc.change_amount),
#                 },
#                 status=400
#             )
#         except ValueError as exc:
#             return Response({"error": str(exc)}, status=400)

#         return Response(
#             {
#                 "success": True,
#                 "order_id": order.id,
#                 "total": order.total_amount
#             },
#             status=status.HTTP_201_CREATED
#         )



class ActiveOrdersAPIView(APIView):
    required_tabs = ("MANAGE_ORDERS",)

    def get(self, request):

        orders = Order.objects.filter(
            order_status="PROCESSING"
        ).order_by("-created_at")

        data = []

        for o in orders:

            payment_mode = None

            if o.payments.exists():
                payment_mode = o.payments.last().payment_type

            data.append({
                "id": o.id,
                "order_status": o.order_status,
                "payment_status": o.payment_status,
                "payment_mode": payment_mode,
                "total_amount": o.total_amount,
                "customer_name": o.customer_name,
            })

        return Response(data)



class UpdateOrderAPIView(APIView):
    required_tabs = ("MANAGE_ORDERS",)

    def _parse_money(self, value, field_name, errors):

        try:
            amount = Decimal(str(value if value is not None else 0))
        except (InvalidOperation, TypeError, ValueError):
            errors[field_name] = "Enter a valid amount"
            return Decimal("0.00")

        if amount < 0:
            errors[field_name] = "Amount cannot be negative"

        return amount

    def _validate_items(self, items, errors):

        if not isinstance(items, list) or not items:
            errors["items"] = "Add at least one item"
            return []

        normalized_items = []

        for index, item in enumerate(items, start=1):
            name = (item.get("name") or "").strip()

            if not name:
                errors["items"] = f"Item {index} is missing a name"
                continue

            try:
                qty = int(item.get("qty"))
            except (TypeError, ValueError):
                errors["items"] = f"Item {index} has an invalid quantity"
                continue

            if qty <= 0:
                errors["items"] = f"Item {index} quantity must be greater than zero"
                continue

            try:
                price = Decimal(str(item.get("price")))
            except (InvalidOperation, TypeError, ValueError):
                errors["items"] = f"Item {index} has an invalid price"
                continue

            if price < 0:
                errors["items"] = f"Item {index} price cannot be negative"
                continue

            normalized_items.append({
                "name": name,
                "qty": qty,
                "price": price
            })

        return normalized_items

    def _validate_payload(self, data):

        errors = {}

        order_type = data.get("order_type")
        valid_order_types = {"DINE_IN", "TAKEAWAY", "DELIVERY"}

        if order_type not in valid_order_types:
            errors["order_type"] = "Select a valid order type"

        customer_name = (data.get("customer_name") or "").strip() or None
        customer_phone = (data.get("customer_phone") or "").strip() or None
        delivery_address = (data.get("delivery_address") or "").strip() or None
        order_note = (data.get("order_note") or "").strip() or None
        table_number = (data.get("table_number") or "").strip() or None

        discount = self._parse_money(data.get("discount", 0), "discount", errors)
        delivery_charge = self._parse_money(
            data.get("delivery_charge", 0),
            "delivery_charge",
            errors
        )

        items = self._validate_items(data.get("items", []), errors)

        delivery_boy = None
        delivery_boy_id = data.get("delivery_boy_id") or None

        if delivery_boy_id:
            try:
                delivery_boy = LedgerAccount.objects.get(
                    id=delivery_boy_id,
                    account_type="DELIVERY"
                )
            except LedgerAccount.DoesNotExist:
                errors["delivery_boy_id"] = "Select a valid delivery boy"

        if order_type == "TAKEAWAY" and not customer_phone:
            errors["customer_phone"] = "Enter phone number"

        if order_type == "DELIVERY":
            if not customer_phone:
                errors["customer_phone"] = "Enter phone number"

            if not delivery_address:
                errors["delivery_address"] = "Enter delivery address"
        else:
            delivery_charge = Decimal("0.00")
            delivery_boy = None

        if order_type != "DINE_IN":
            table_number = None

        return errors, {
            "order_type": order_type,
            "customer_name": customer_name,
            "customer_phone": customer_phone,
            "delivery_address": delivery_address,
            "order_note": order_note,
            "table_number": table_number,
            "discount": discount,
            "delivery_charge": delivery_charge,
            "delivery_boy": delivery_boy,
            "items": items
        }

    def patch(self, request, pk):

        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({"error": "Order not found"}, status=404)

        if order.order_status not in {"PROCESSING", "READY"}:
            return Response(
                {"error": "Only processing or ready orders can be updated"},
                status=400
            )

        data = request.data

        errors, validated_data = self._validate_payload(data)

        if errors:
            return Response({"errors": errors}, status=400)

        update_order_details(order, **validated_data)

        return Response(
            {
                "success": True,
                "order_id": order.id,
                "total": order.total_amount
            },
            status=status.HTTP_200_OK
        )
    
class CollectPaymentAPIView(APIView):
    required_tabs = ("MANAGE_ORDERS",)
    required_permissions = ("COLLECT_PAYMENTS",)
    def post(self, request, pk):

        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({"error": "Order not found"}, status=404)

        if (
            order.order_status == "COMPLETED"
            and order.payment_status != "PAID"
            and order.customer_account_id
        ):
            return Response(
                {
                    "error": "Completed unpaid orders assigned to ledger must be collected from Ledger."
                },
                status=400
            )

        data = request.data

        try:
            amount = Decimal(str(data.get("amount", 0)))
            cash_amount = Decimal(str(data.get("cash_amount", 0) or 0))
            online_amount = Decimal(str(data.get("online_amount", 0) or 0))
        except (InvalidOperation, TypeError, ValueError):
            return Response({"error": "Enter a valid payment amount"}, status=400)

        payment_type = data.get("payment_type", "CASH")
        deduct_change = bool(data.get("deduct_change"))

        if amount <= 0:
            return Response({"error": "Invalid payment amount"}, status=400)

        try:

            collect_payment(
                order,
                amount,
                payment_type,
                cash_amount=cash_amount,
                online_amount=online_amount,
                deduct_change=deduct_change
            )

        except ChangeConfirmationRequired as exc:

            return Response(
                {
                    "error": f"Deduct remaining {exc.change_amount} from cash drawer?",
                    "requires_change_confirmation": True,
                    "change_amount": str(exc.change_amount),
                },
                status=400
            )

        except ValueError as e:

            return Response({"error": str(e)}, status=400)

        return Response(
            {
                "success": True,
                "order_id": order.id,
                "payment_status": order.payment_status
            }
        )



class CompleteOrderAPIView(APIView):
    required_tabs = ("MANAGE_ORDERS",)

    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({"error":"Order not found"}, status=404)

        if order.order_status != "READY":
            return Response({"error":"Only ready orders can be completed"}, status=400)

        # already paid
        if order.payment_status == "PAID":
            order.order_status = "COMPLETED"
            order.completed_at = timezone.now()
            order.save(update_fields=["order_status", "completed_at"])

            return Response({"success":True})

        # unpaid → need customer info
        name = request.data.get("name")
        phone = request.data.get("phone")
        address = request.data.get("address")

        if not phone:
            return Response({"error":"Phone required"}, status=400)

        complete_unpaid_order(order,name,phone,address)

        return Response({"success":True})

class ReadyOrderAPIView(APIView):
    required_tabs = ("MANAGE_ORDERS",)

    def post(self, request, pk):

        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({"error": "Order not found"}, status=404)

        if order.order_status != "PROCESSING":
            return Response({"error": "Only processing orders can be marked ready"}, status=400)

        order.order_status = "READY"
        order.save(update_fields=["order_status"])

        return Response({
            "success": True,
            "order_id": order.id,
            "order_status": order.order_status
        })
    
class CancelOrderAPIView(APIView):
    required_tabs = ("MANAGE_ORDERS",)

    def post(self, request, pk):

        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({"error": "Order not found"}, status=404)

        cooked = bool(request.data.get("cooked", False))
        refunded = bool(request.data.get("refunded", False))

        try:
            refund_amount = Decimal(str(request.data.get("refund_amount", 0) or 0))
        except (InvalidOperation, TypeError, ValueError):
            return Response({"error": "Enter a valid refund amount"}, status=400)

        try:
            cancel_order(
                order,
                cooked=cooked,
                refunded=refunded,
                refund_amount=refund_amount
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        return Response({"success": True})

 
    
class OrdersFilterAPIView(APIView):
    required_tabs = ("MANAGE_ORDERS",)

    def get(self, request):

        filter_type = request.query_params.get("filter", "ALL")
        delivery_boy_id = request.query_params.get("delivery_boy")
        exclude_address_text = (request.query_params.get("exclude_address_text") or "").strip()
        from_date = request.query_params.get("from_date")
        to_date = request.query_params.get("to_date")

        qs = Order.objects.all().prefetch_related("items", "payments")

        if filter_type in ["PROCESSING","READY","COMPLETED","CANCELLED"]:
            qs = qs.filter(order_status=filter_type)

        if filter_type in ["PAID","UNPAID"]:
            qs = qs.filter(payment_status=filter_type)

        if filter_type == "DINE_IN":
            qs = qs.filter(order_type="DINE_IN")

        if filter_type in ["TAKEAWAY", "DELIVERY"]:
            qs = qs.filter(order_type=filter_type)

        if from_date:
            parsed_from_date = parse_date(from_date)
            if not parsed_from_date:
                return Response({"error": "Invalid from_date"}, status=400)
            qs = qs.filter(created_at__date__gte=parsed_from_date)

        if to_date:
            parsed_to_date = parse_date(to_date)
            if not parsed_to_date:
                return Response({"error": "Invalid to_date"}, status=400)
            qs = qs.filter(created_at__date__lte=parsed_to_date)

        if filter_type == "DELIVERY" and delivery_boy_id:
            qs = qs.filter(delivery_boy_id=delivery_boy_id)

        if filter_type == "DELIVERY" and delivery_boy_id and exclude_address_text:
            qs = qs.exclude(delivery_address__icontains=exclude_address_text)

        if filter_type == "SCHEDULED":
            qs = qs.order_by("scheduled_time", "-created_at")
        else:
            qs = qs.order_by("-created_at")

        data = []

        for o in qs:

            payment_mode = None

            if o.payments.exists():
                payment_mode = o.payments.last().payment_type

            amount_paid = o.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
            remaining_amount = o.total_amount - amount_paid

            if remaining_amount < 0:
                remaining_amount = Decimal("0.00")

            data.append({
                "id": o.id,
                "order_type": o.order_type,
                "order_status": o.order_status,
                "payment_status": o.payment_status,
                "payment_mode": payment_mode,
                "total_amount": o.total_amount,
                "remaining_amount": remaining_amount,
                "customer_name": o.customer_name,
                "customer_phone": o.customer_phone,
                "delivery_address": o.delivery_address,
                "created_at": o.created_at,
                "scheduled_time": o.scheduled_time,
                "items": [
                    {
                        "id": item.id,
                        "item_name": item.item_name,
                        "quantity": item.quantity,
                    }
                    for item in o.items.all()
                ],
            })

        return Response(data)
    

class OrderDisplayAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):

        orders = Order.objects.exclude(
            order_type="DELIVERY"
        ).order_by("-created_at")[:50]

        data = []

        for o in orders:

            data.append({
                "id": o.id,
                "status": o.order_status,
                "amount": o.total_amount,
                "created_at": o.created_at,
                "table": o.table_number
            })

        return Response(data)
    

class StartScheduledOrderAPIView(APIView):
    required_tabs = ("MANAGE_ORDERS",)

    def post(self, request, order_id):

        try:
            order = Order.objects.get(id=order_id)

        except Order.DoesNotExist:
            return Response({"error": "Order not found"}, status=404)

        if order.order_status != "SCHEDULED":
            return Response({"error": "Order is not scheduled"}, status=400)

        order.order_status = "PROCESSING"
        order.save(update_fields=["order_status"])

        if (
            order.order_type == "DELIVERY"
            and order.delivery_boy
            and order.payment_status != "PAID"
        ):
            record_debit(
                account=order.delivery_boy,
                amount=order.total_amount,
                payment_type="SYSTEM",
                reference=f"ORDER-{order.id}",
                description=f"Delivery order assigned #{order.id}"
            )

        return Response({
            "success": True,
            "order_id": order.id
        })
