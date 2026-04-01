from __future__ import annotations

from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "guide-assets"
OUTPUT = ROOT / "Al-Maidah-Manager-Guide.pdf"


def esc(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(colors.HexColor("#64748b"))
    canvas.drawString(doc.leftMargin, 10 * mm, "Al-Maidah Control System • Manager Guide")
    canvas.drawRightString(doc.pagesize[0] - doc.rightMargin, 10 * mm, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def styles():
    base = getSampleStyleSheet()
    return {
        "cover_kicker": ParagraphStyle(
            "cover_kicker",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=16,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#0f766e"),
            spaceAfter=8,
        ),
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=28,
            leading=34,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#0f172a"),
            spaceAfter=10,
        ),
        "cover_subtitle": ParagraphStyle(
            "cover_subtitle",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=12,
            leading=18,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#334155"),
        ),
        "part_title": ParagraphStyle(
            "part_title",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=30,
            alignment=TA_CENTER,
            textColor=colors.white,
            spaceAfter=8,
        ),
        "part_body": ParagraphStyle(
            "part_body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=11,
            leading=18,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#e2e8f0"),
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=23,
            textColor=colors.HexColor("#0f172a"),
            spaceAfter=6,
        ),
        "lead": ParagraphStyle(
            "lead",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=16,
            textColor=colors.HexColor("#334155"),
            spaceAfter=6,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=11.5,
            leading=15,
            textColor=colors.HexColor("#0f172a"),
            spaceBefore=6,
            spaceAfter=3,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.4,
            leading=14,
            textColor=colors.HexColor("#1e293b"),
            spaceAfter=3,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.2,
            leading=13.5,
            textColor=colors.HexColor("#1e293b"),
            leftIndent=12,
            firstLineIndent=-8,
            bulletIndent=0,
            spaceAfter=1,
        ),
        "number": ParagraphStyle(
            "number",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.2,
            leading=13.5,
            textColor=colors.HexColor("#1e293b"),
            leftIndent=14,
            firstLineIndent=-10,
            spaceAfter=1,
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.4,
            leading=12,
            textColor=colors.HexColor("#475569"),
        ),
    }


S = styles()


def para(text: str, style: str = "body") -> Paragraph:
    return Paragraph(esc(text), S[style])


def bullets(items: list[str]):
    flow = []
    for item in items:
        flow.append(Paragraph(esc(item), S["bullet"], bulletText="•"))
    return flow


def numbers(items: list[str]):
    flow = []
    for index, item in enumerate(items, start=1):
        flow.append(Paragraph(esc(item), S["number"], bulletText=f"{index}."))
    return flow


def box(title: str, lines: list[str], tone: str = "cyan") -> Table:
    palette = {
        "cyan": (colors.HexColor("#0f172a"), colors.HexColor("#e0f2fe"), colors.HexColor("#075985")),
        "emerald": (colors.HexColor("#052e2b"), colors.HexColor("#d1fae5"), colors.HexColor("#047857")),
        "amber": (colors.HexColor("#422006"), colors.HexColor("#fef3c7"), colors.HexColor("#b45309")),
        "rose": (colors.HexColor("#4c0519"), colors.HexColor("#ffe4e6"), colors.HexColor("#be123c")),
        "slate": (colors.HexColor("#0f172a"), colors.HexColor("#e2e8f0"), colors.HexColor("#475569")),
    }
    bg, title_color, border = palette[tone]
    content = [Paragraph(f"<b>{esc(title)}</b>", ParagraphStyle("box_title", parent=S["body"], textColor=title_color, fontName="Helvetica-Bold", fontSize=10.2, leading=14))]
    for line in lines:
        content.append(Paragraph(esc(line), ParagraphStyle("box_body", parent=S["small"], textColor=colors.white, leading=13)))
    table = Table([[content]], colWidths=[174 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("BOX", (0, 0), (-1, -1), 1, border),
                ("ROUNDEDCORNERS", (0, 0), (-1, -1), 12),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return table


def image_block(name: str, max_w_mm: float = 124, max_h_mm: float = 88) -> Image:
    path = ASSETS / name
    with PILImage.open(path) as img:
        width, height = img.size
    max_w = max_w_mm * mm
    max_h = max_h_mm * mm
    scale = min(max_w / width, max_h / height)
    return Image(str(path), width=width * scale, height=height * scale)


def image_with_caption(name: str, caption: str, max_w_mm: float = 124, max_h_mm: float = 88) -> Table:
    img = image_block(name, max_w_mm=max_w_mm, max_h_mm=max_h_mm)
    caption_para = Paragraph(esc(caption), ParagraphStyle("caption", parent=S["small"], alignment=TA_CENTER, textColor=colors.HexColor("#64748b")))
    table = Table([[img], [caption_para]], colWidths=[max_w_mm * mm])
    table.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return table


def section_page(title: str, subtitle: str, image_name: str, image_caption: str, blocks: list[dict], opener: str | None = None):
    story = [Paragraph(esc(title), S["h1"]), Paragraph(esc(subtitle), S["lead"]), Spacer(1, 2)]
    if opener:
        story.append(box("In one line", [opener], tone="emerald"))
        story.append(Spacer(1, 6))
    story.append(image_with_caption(image_name, image_caption))
    story.append(Spacer(1, 8))

    for block in blocks:
        story.append(Paragraph(esc(block["title"]), S["h2"]))
        if block["type"] == "bullets":
            story.extend(bullets(block["items"]))
        elif block["type"] == "numbers":
            story.extend(numbers(block["items"]))
        elif block["type"] == "box":
            story.append(box(block["title"], block["items"], tone=block.get("tone", "slate")))
        story.append(Spacer(1, 2))

    story.append(PageBreak())
    return story


def part_page(title: str, subtitle: str, includes: list[str], tone_hex: str):
    bg = colors.HexColor(tone_hex)
    title_para = Paragraph(esc(title), S["part_title"])
    sub_para = Paragraph(esc(subtitle), S["part_body"])
    include_lines = [Paragraph(esc(line), ParagraphStyle("part_list", parent=S["part_body"], fontSize=10.5, leading=16)) for line in includes]
    card = Table([[title_para], [sub_para], [Spacer(1, 6)], [include_lines]], colWidths=[174 * mm])
    card.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("ROUNDEDCORNERS", (0, 0), (-1, -1), 18),
                ("LEFTPADDING", (0, 0), (-1, -1), 18),
                ("RIGHTPADDING", (0, 0), (-1, -1), 18),
                ("TOPPADDING", (0, 0), (-1, -1), 34),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 34),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("ALIGN", (0, 0), (-1, 1), "CENTER"),
            ]
        )
    )
    return [Spacer(1, 62 * mm), card, PageBreak()]


def cover_page():
    return [
        Spacer(1, 20 * mm),
        Paragraph("AL-MAIDAH CONTROL SYSTEM", S["cover_kicker"]),
        Paragraph("Manager Training Guide", S["cover_title"]),
        Paragraph(
            "A beginner-friendly handbook for restaurant managers and admin users.",
            S["cover_subtitle"],
        ),
        Spacer(1, 8),
        image_with_caption("login.png", "The login page of the control system", max_w_mm=120, max_h_mm=82),
        Spacer(1, 14),
        box(
            "What this guide covers",
            [
                "How to open the system and what each address means",
                "What every major tab does and when to use it",
                "Step-by-step instructions for the most important daily flows",
                "Simple rules that help a beginner avoid common mistakes",
            ],
            tone="cyan",
        ),
        Spacer(1, 10),
        Paragraph("Version: April 1, 2026", S["cover_subtitle"]),
        PageBreak(),
    ]


def contents_page():
    rows = [
        ["1", "Cover"],
        ["2", "Contents"],
        ["3", "Part 1 • Getting Started"],
        ["4", "Opening the system and understanding the web addresses"],
        ["5", "Logging in, roles, and basic navigation"],
        ["6", "Part 2 • Sales and Orders"],
        ["7", "Menu Tab"],
        ["8", "Orders Tab"],
        ["9", "Manage Orders Tab"],
        ["10", "Part 3 • Stock and Finance"],
        ["11", "Inventory Tab"],
        ["12", "Ledger Tab"],
        ["13", "Expenses Tab"],
        ["14", "Part 4 • Review and Control"],
        ["15", "Reports Tab"],
        ["16", "Access Tab"],
        ["17", "Customer Display"],
        ["18", "Daily workflow and first-week checklist"],
    ]
    table = Table(rows, colWidths=[18 * mm, 148 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("LEADING", (0, 0), (-1, -1), 14),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e2e8f0")),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return [
        Paragraph("Contents", S["h1"]),
        Paragraph(
            "This handbook is divided into parts so a complete beginner can learn the system in a clean order.",
            S["lead"],
        ),
        Spacer(1, 4),
        table,
        Spacer(1, 10),
        box(
            "Recommended learning order",
            [
                "Start with Part 1 to understand where to open the system and how to move around it.",
                "Then learn Part 2 first, because Menu, Orders, and Manage Orders are the daily service tools.",
                "After that, move into Inventory, Ledger, Expenses, and finally Reports and Access.",
            ],
            tone="amber",
        ),
        PageBreak(),
    ]


def build_story():
    story = []
    story.extend(cover_page())
    story.extend(contents_page())

    story.extend(
        part_page(
            "Part 1 • Getting Started",
            "Learn where to open the system, what each web address means, and how the main screen is organized.",
            [
                "Opening the system",
                "Main web addresses",
                "Login",
                "Roles, theme, font, and logout",
            ],
            "#0f766e",
        )
    )

    story.extend(
        section_page(
            "Opening the System",
            "This page explains which browser address to open and what each one is used for.",
            "login.png",
            "The main app opens on the sign-in page.",
            [
                {
                    "title": "The two main addresses",
                    "type": "bullets",
                    "items": [
                        "http://localhost:5173/ is the main control panel for admin and staff work.",
                        "http://localhost:5173/display is the public customer display screen.",
                        "On deployment, localhost is replaced by your live server or domain, but the meaning stays the same.",
                    ],
                },
                {
                    "title": "What “localhost” means",
                    "type": "bullets",
                    "items": [
                        "It simply means “this same computer”.",
                        "If the app is running locally, the browser opens it from this machine.",
                    ],
                },
                {
                    "title": "When to use each page",
                    "type": "numbers",
                    "items": [
                        "Open the main address to log in and do restaurant work.",
                        "Open the /display address on a second screen or TV for customers.",
                    ],
                },
            ],
            opener="One address is for staff work. The other address is for the customer-facing display screen.",
        )
    )

    story.extend(
        section_page(
            "Logging In and Moving Around",
            "This page explains what happens after sign-in and how the top of the app is organized.",
            "dashboard-home.png",
            "After login, the main shell shows the tabs you are allowed to use.",
            [
                {
                    "title": "What happens after login",
                    "type": "numbers",
                    "items": [
                        "Enter username and password.",
                        "Click Enter Control Panel.",
                        "Wait for the welcome animation to finish.",
                        "Use the visible tabs to move around the system.",
                    ],
                },
                {
                    "title": "Top-right controls",
                    "type": "bullets",
                    "items": [
                        "Theme switches between Night and Day mode.",
                        "Font changes text size to Small, Medium, or Big.",
                        "Logout signs you out safely.",
                    ],
                },
                {
                    "title": "Roles in simple words",
                    "type": "bullets",
                    "items": [
                        "Admin can use everything and can manage staff access.",
                        "Staff only sees the tabs given by the admin.",
                        "Some staff may open Manage Orders but still not be allowed to collect payments.",
                    ],
                },
            ],
            opener="If you can see a tab, your account has permission to use it.",
        )
    )

    story.extend(
        part_page(
            "Part 2 • Sales and Orders",
            "These are the daily service tabs. Learn these first if you want a manager to run the counter and live order flow confidently.",
            [
                "Menu",
                "Orders",
                "Manage Orders",
            ],
            "#0f172a",
        )
    )

    story.extend(
        section_page(
            "Menu Tab",
            "Use Menu to control what the restaurant sells and what the cashier is allowed to place into orders.",
            "menu.png",
            "The menu workspace for creating, filtering, editing, and hiding items.",
            [
                {
                    "title": "What you can do here",
                    "type": "bullets",
                    "items": [
                        "Create a menu item with name, category, price, and availability.",
                        "Edit an existing item when price or details change.",
                        "Hide an item if it is not available today.",
                        "Delete an item if it should not exist anymore.",
                    ],
                },
                {
                    "title": "How to add a new menu item",
                    "type": "numbers",
                    "items": [
                        "Open Create Menu Item.",
                        "Enter name, category, and price.",
                        "Choose whether the item is available.",
                        "Save it.",
                    ],
                },
                {
                    "title": "Manager rule",
                    "type": "bullets",
                    "items": [
                        "If an item is only out for today, make it unavailable instead of deleting it.",
                    ],
                },
            ],
            opener="If it is not correctly set in Menu, the cashier should not be trying to sell it.",
        )
    )

    story.extend(
        section_page(
            "Orders Tab",
            "Use Orders to place new dine-in, takeaway, and delivery orders.",
            "orders.png",
            "The order creation screen where type, customer details, schedule, and items are prepared.",
            [
                {
                    "title": "Order types",
                    "type": "bullets",
                    "items": [
                        "Dine In is for seated guests inside the restaurant.",
                        "Takeaway is for packed counter pickup.",
                        "Delivery is for orders sent out with a delivery boy.",
                    ],
                },
                {
                    "title": "Basic placing flow",
                    "type": "numbers",
                    "items": [
                        "Choose the order type.",
                        "Fill only the needed details such as table, phone, or address.",
                        "Decide whether the order is live or scheduled.",
                        "Continue to the order screen and add items.",
                        "Apply discount, delivery charge, and order note if needed.",
                        "Choose Pay Now or Pay Later, then place the order.",
                    ],
                },
                {
                    "title": "Important rules",
                    "type": "bullets",
                    "items": [
                        "Scheduled orders always need a phone number.",
                        "Delivery orders need a phone number, address, and delivery boy.",
                        "If full money is not being received, use Pay Later.",
                    ],
                },
            ],
            opener="Orders is the cashier screen: create the order here, then control it later from Manage Orders.",
        )
    )

    story.extend(
        section_page(
            "Manage Orders Tab",
            "Use Manage Orders to run the live queue after an order has already been created.",
            "manage-orders.png",
            "The live operations screen for search, filters, actions, collection, cancellation, and printing.",
            [
                {
                    "title": "Main actions in this tab",
                    "type": "bullets",
                    "items": [
                        "View opens the full order details.",
                        "Update lets you correct items or customer/order information.",
                        "Start Scheduled Order moves a scheduled order into the live queue.",
                        "Ready marks a processing order as prepared.",
                        "Complete closes the order operationally.",
                        "Collect receives unpaid money later.",
                        "Cancel stops the order with cooked/refund choices.",
                        "Print prints the order bill or slip.",
                    ],
                },
                {
                    "title": "How to use this tab in daily life",
                    "type": "numbers",
                    "items": [
                        "Search or filter the order you want.",
                        "Use View if you need clarity before taking action.",
                        "Move PROCESSING to READY when the food is prepared.",
                        "Use Complete only when the order is truly finished.",
                        "Use Collect only when the payment is actually being received.",
                    ],
                },
                {
                    "title": "Financial safety rule",
                    "type": "bullets",
                    "items": [
                        "Not every user should be allowed to collect. That permission can be locked separately.",
                    ],
                },
            ],
            opener="Think of this as the control room for all existing orders.",
        )
    )

    story.extend(
        part_page(
            "Part 3 • Stock and Finance",
            "These tabs help the manager track stock, dues, collections, and business costs.",
            [
                "Inventory",
                "Ledger",
                "Expenses",
            ],
            "#7c2d12",
        )
    )

    story.extend(
        section_page(
            "Inventory Tab",
            "Use Inventory to track raw items, stock entry bills, stock-out, low stock, and corrections.",
            "inventory.png",
            "The inventory workspace for item creation, stock out, low-stock alerts, bills, and history.",
            [
                {
                    "title": "What this tab controls",
                    "type": "bullets",
                    "items": [
                        "Create raw inventory items once.",
                        "Add stock through draft bills and confirm them.",
                        "Stock out items when stock leaves the inventory.",
                        "Use manual adjustment only for correction cases.",
                        "Review current snapshot, stock-out log, and history.",
                    ],
                },
                {
                    "title": "Important concept",
                    "type": "bullets",
                    "items": [
                        "A product can exist in the system even if stock is zero.",
                        "Low Stock Alerts can still help you identify what to buy next.",
                    ],
                },
                {
                    "title": "Daily manager use",
                    "type": "numbers",
                    "items": [
                        "Check Low Stock Alerts.",
                        "Create or resume a draft bill when stock arrives.",
                        "Confirm the bill only after checking quantities and prices.",
                        "Log stock-out honestly for kitchen use, damage, expiry, or wastage.",
                    ],
                },
            ],
            opener="Inventory is manual in this system, so accurate daily logging matters a lot.",
        )
    )

    story.extend(
        section_page(
            "Ledger Tab",
            "Use Ledger to answer money questions: who owes you, what was collected, and what is still pending.",
            "ledger.png",
            "The ledger workspace with accounts, transactions, and daily report sections.",
            [
                {
                    "title": "The three ledger areas",
                    "type": "bullets",
                    "items": [
                        "Accounts for customer, delivery, and vendor records.",
                        "Transactions for searching the money history.",
                        "Daily Report for today’s money snapshot.",
                    ],
                },
                {
                    "title": "What you can do here",
                    "type": "bullets",
                    "items": [
                        "Create ledger accounts.",
                        "Open account history and balance details.",
                        "Collect money from customer accounts.",
                        "Check customer outstanding and delivery pending.",
                    ],
                },
                {
                    "title": "Safe use rule",
                    "type": "bullets",
                    "items": [
                        "Use manual collection only when money is truly received from the customer.",
                    ],
                },
            ],
            opener="Ledger is for dues and collections, not for inventory or expense entry.",
        )
    )

    story.extend(
        section_page(
            "Expenses Tab",
            "Use Expenses to record business spending for later reporting and review.",
            "expenses.png",
            "The expenses workspace with categories, totals, filters, and expense entry.",
            [
                {
                    "title": "What you can record",
                    "type": "bullets",
                    "items": [
                        "Category",
                        "Amount",
                        "Payment mode",
                        "Date",
                        "Description or reason",
                        "Reference number if any",
                    ],
                },
                {
                    "title": "Typical manager flow",
                    "type": "numbers",
                    "items": [
                        "Create the expense category if needed.",
                        "Enter the expense details clearly.",
                        "Save the entry.",
                        "Use filters later to review the period you want.",
                    ],
                },
                {
                    "title": "Important concept",
                    "type": "bullets",
                    "items": [
                        "In this setup, expenses are logged for reporting. They do not automatically reduce the cash drawer.",
                    ],
                },
            ],
            opener="Good expense records make reports more truthful.",
        )
    )

    story.extend(
        part_page(
            "Part 4 • Review and Control",
            "These tools help the owner or manager review performance, control staff access, and run the public display screen.",
            [
                "Reports",
                "Access",
                "Customer Display",
            ],
            "#1e293b",
        )
    )

    story.extend(
        section_page(
            "Reports Tab",
            "Use Reports to answer business questions about revenue, expenses, stock-out value, profit, refunds, and risk.",
            "reports.png",
            "The business review screen with date controls, charts, summary cards, and detailed sections.",
            [
                {
                    "title": "How to use it",
                    "type": "numbers",
                    "items": [
                        "Choose a quick preset or set your own date range.",
                        "Click Generate Reports.",
                        "Read the summary cards first.",
                        "Then move into charts and detailed sections.",
                    ],
                },
                {
                    "title": "Questions this tab can answer",
                    "type": "bullets",
                    "items": [
                        "What was revenue in this period?",
                        "How much stock value went out?",
                        "How much was spent in expenses?",
                        "What is the current customer outstanding amount?",
                        "Which items are low in stock right now?",
                    ],
                },
                {
                    "title": "Important reminder",
                    "type": "bullets",
                    "items": [
                        "Reports depend on honest manual inventory and expense logging.",
                    ],
                },
            ],
            opener="Reports brings together the numbers from orders, inventory, expenses, and ledger.",
        )
    )

    story.extend(
        section_page(
            "Access Tab",
            "Use Access to create staff logins, change tab permissions, and control who can collect payments.",
            "access.png",
            "The access-control screen for account creation, editing, activation, deletion, and special permissions.",
            [
                {
                    "title": "What the admin can do here",
                    "type": "bullets",
                    "items": [
                        "Create staff accounts.",
                        "Give only the needed tabs.",
                        "Activate or deactivate a user.",
                        "Delete an account if it should not exist anymore.",
                        "Grant or remove the special Collect Payments permission.",
                    ],
                },
                {
                    "title": "Most important safety point",
                    "type": "bullets",
                    "items": [
                        "A user can be allowed into Manage Orders but still be blocked from collecting payments.",
                    ],
                },
                {
                    "title": "Admin habit to follow",
                    "type": "bullets",
                    "items": [
                        "Give the smallest access a person needs, not the largest.",
                    ],
                },
            ],
            opener="Use Access to control people, not just screens.",
        )
    )

    story.extend(
        section_page(
            "Customer Display",
            "Use the customer display on a second screen to show live and ready orders to customers.",
            "display.png",
            "The public-facing display page that shows order movement outside the control panel.",
            [
                {
                    "title": "Where it is opened",
                    "type": "bullets",
                    "items": [
                        "Local example: http://localhost:5173/display",
                        "On deployment, the address becomes your live site address plus /display",
                    ],
                },
                {
                    "title": "Why this screen is useful",
                    "type": "bullets",
                    "items": [
                        "Customers can see order progress without asking repeatedly.",
                        "Ready orders become easier to announce and manage.",
                        "In supported browsers, a ready sound can also play.",
                    ],
                },
                {
                    "title": "Best use",
                    "type": "bullets",
                    "items": [
                        "Keep it open on a second monitor or TV near the front of the restaurant.",
                    ],
                },
            ],
            opener="The display screen is public. The control panel is private.",
        )
    )

    story.extend(
        section_page(
            "Daily Workflow and First-Week Checklist",
            "This last page gives a simple routine a new manager can follow with confidence.",
            "dashboard-home.png",
            "A final reminder of the main control-panel shell.",
            [
                {
                    "title": "Before opening",
                    "type": "numbers",
                    "items": [
                        "Log in.",
                        "Check Menu availability.",
                        "Check Inventory low-stock alerts.",
                        "Look at Reports or Ledger if needed.",
                    ],
                },
                {
                    "title": "During service",
                    "type": "numbers",
                    "items": [
                        "Place new orders in Orders.",
                        "Run the live queue in Manage Orders.",
                        "Use Ready and Complete properly.",
                        "Collect only when money is actually received.",
                        "Record stock-out and expenses honestly.",
                    ],
                },
                {
                    "title": "At the end of the day",
                    "type": "numbers",
                    "items": [
                        "Check unfinished or unpaid orders.",
                        "Review Ledger.",
                        "Review Expenses.",
                        "Open Reports and study revenue, expenses, refunds, wastage, and low stock.",
                    ],
                },
            ],
            opener="If a beginner learns Orders, Manage Orders, Inventory, and Expenses well, the restaurant can already run smoothly.",
        )
    )

    return story


def main():
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="Al-Maidah Manager Guide",
        author="Codex",
    )
    doc.build(build_story(), onFirstPage=footer, onLaterPages=footer)
    print(f"Created {OUTPUT}")


if __name__ == "__main__":
    main()
