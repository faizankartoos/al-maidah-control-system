import { buildApiUrl } from "../services/api";
import { receiptBranding } from "../config/receiptBranding";

function formatOrderCreatedAt(value) {
  return new Date(value)
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(" am", " AM")
    .replace(" pm", " PM");
}

export async function printOrderBill(orderId) {
  const response = await fetch(buildApiUrl(`orders/${orderId}/`));

  if (!response.ok) {
    throw new Error("Failed to load order for printing");
  }

  const order = await response.json();
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent || "",
  );

  const win = window.open("", "", "width=400,height=600");

  if (!win) {
    alert("Unable to open print preview. Please allow pop-ups and try again.");
    return;
  }

  const createdAt = formatOrderCreatedAt(order.created_at);
  const paymentQrUrl = receiptBranding.paymentQrPath
    ? new URL(receiptBranding.paymentQrPath, window.location.origin).href
    : "";

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Bill</title>
      <style>
        @page {
          size: 58mm auto;
          margin: 0;
        }

        body {
          font-family: monospace;
          width: 58mm;
          margin: 0;
          padding: 4px;
          font-size: 15px;
          font-weight: 600;
        }

        .center { text-align: center; }
        .bold { font-weight: 700; }

        .row {
          display: flex;
          justify-content: space-between;
        }

        .line {
          border-top: 1px dashed black;
          margin: 6px 0;
        }

        .big {
          font-size: 25px;
          font-weight: 700;
        }

        .title {
          font-size: 25px;
          font-weight: 700;
          white-space: nowrap;
          text-align: center;
          word-break: keep-all;
        }

        .location {
          font-size: 15px;
        }

        .qr-section {
          margin-top: 8px;
          text-align: center;
        }

        .qr-heading {
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 6px;
        }

        .qr-image {
          width: 130px;
          height: 130px;
          object-fit: contain;
        }

        .footer-note {
          margin-top: 8px;
          font-size: 12px;
          text-align: center;
          line-height: 1.4;
        }

        .social-row {
          margin-top: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          font-size: 12px;
          text-align: center;
        }

        .instagram-icon {
          width: 13px;
          height: 13px;
          flex-shrink: 0;
        }
      </style>
    </head>
    <body>
      <div class="center title">${receiptBranding.restaurantName}</div>
      <div class="center location">${receiptBranding.location}</div>
      <div class="center location">Phone: ${receiptBranding.phone}</div>
      <div class="center location">${createdAt}</div>

      ${order.order_note ? `
        <div class="line"></div>
        <div class="bold">Order Note</div>
        <div>${order.order_note}</div>
      ` : ""}

      <div class="line"></div>

      <div class="center title">${order.order_type}</div>
      <div class="center title">Order: ${order.id}</div>
      ${
        order.order_type === "DINE_IN" && order.table_number
          ? `<div>Table: ${order.table_number}</div>`
          : order.order_type === "TAKEAWAY"
            ? `<div>Phone: ${order.customer_phone || "-"}</div>`
            : order.order_type === "DELIVERY"
              ? `
                  <div>Area: ${order.area_name || "-"}</div>
                  <div>Phone: ${order.customer_phone || "-"}</div>
                  <div>Address: ${order.delivery_address || "-"}</div>
                `
              : ""
      }

      <div class="line"></div>

      ${order.items.map((item) => `
        <div class="row">
          <span>${item.item_name} x${item.quantity}</span>
          <span>${item.total_price}</span>
        </div>
      `).join("")}

      <div class="line"></div>

      <div class="row">
        <span>Subtotal</span>
        <span>₹${order.subtotal}</span>
      </div>

      <div class="row">
        <span>Discount</span>
        <span>₹${order.discount}</span>
      </div>

      <div class="row">
        <span>Delivery</span>
        <span>₹${order.delivery_charge}</span>
      </div>

      <div class="line"></div>

      <div class="row big">
        <span>Total</span>
        <span>₹${order.total_amount}</span>
      </div>

      <div class="line"></div>

      <div>Payment: ${order.payment_status}</div>
      <div>Mode: ${order.payment_mode || "-"}</div>

      <div class="line"></div>
      <div class="qr-section">
        <div class="qr-heading">${receiptBranding.paymentQrHeading}</div>
        <img
          src="${paymentQrUrl}"
          alt="Payment QR"
          class="qr-image"
          onerror="this.closest('.qr-section').style.display='none'"
        />
      </div>
      <div class="footer-note bold">Thank you</div>
      <div class="footer-note">For Feedback/Suggestions: WhatsApp us at ${receiptBranding.feedbackWhatsapp}</div>
      <div class="social-row">
        <svg class="instagram-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4.8" ry="4.8" fill="none" stroke="currentColor" stroke-width="2"></rect>
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2"></circle>
          <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor"></circle>
        </svg>
        <span>Follow us on Instagram: ${receiptBranding.instagramHandle}</span>
      </div>
      <div style="margin-top:10px;">
        <br/>
      </div>
    </body>
    </html>
  `);

  win.document.close();
  win.focus();

  win.onload = () => {
    setTimeout(() => {
      if (!isMobileDevice) {
        let hasClosed = false;
        let printMediaQuery = null;

        const closePreview = () => {
          if (hasClosed || win.closed) {
            return;
          }

          hasClosed = true;

          if (printMediaQuery) {
            if (typeof printMediaQuery.removeEventListener === "function") {
              printMediaQuery.removeEventListener("change", handlePrintMediaChange);
            } else if (typeof printMediaQuery.removeListener === "function") {
              printMediaQuery.removeListener(handlePrintMediaChange);
            }
          }

          window.setTimeout(() => {
            if (!win.closed) {
              win.close();
            }
          }, 120);
        };

        const handlePrintMediaChange = (event) => {
          if (!event.matches) {
            closePreview();
          }
        };

        win.onafterprint = closePreview;

        if (typeof win.matchMedia === "function") {
          printMediaQuery = win.matchMedia("print");

          if (typeof printMediaQuery.addEventListener === "function") {
            printMediaQuery.addEventListener("change", handlePrintMediaChange);
          } else if (typeof printMediaQuery.addListener === "function") {
            printMediaQuery.addListener(handlePrintMediaChange);
          }
        }
      }

      win.focus();
      win.print();
    }, isMobileDevice ? 500 : 200);
  };
}
