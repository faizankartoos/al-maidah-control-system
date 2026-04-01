from pathlib import Path
import json
import urllib.request

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "guide-assets"
ASSETS.mkdir(parents=True, exist_ok=True)

BASE_URL = "http://localhost:5173"
API_LOGIN_URL = "http://127.0.0.1:8000/api/auth/login/"
USERNAME = "guide_admin_local"
PASSWORD = "GuidePass123!"
CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TOKEN_KEY = "al_maidah_auth_token"


def get_token():
    payload = json.dumps({
        "username": USERNAME,
        "password": PASSWORD,
    }).encode("utf-8")
    request = urllib.request.Request(
        API_LOGIN_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        data = json.loads(response.read().decode("utf-8"))
    return data["token"]


def capture():
    token = get_token()
    print("Token acquired", flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path=CHROME_PATH,
            args=["--disable-dev-shm-usage"],
        )

        context = browser.new_context(
            viewport={"width": 1440, "height": 1050},
            device_scale_factor=1.25,
        )
        page = context.new_page()

        page.goto(BASE_URL, wait_until="domcontentloaded")
        page.wait_for_timeout(1200)
        page.screenshot(path=str(ASSETS / "login.png"))
        print("Captured login", flush=True)

        page.evaluate(
            """([key, value]) => {
                window.localStorage.setItem(key, value);
            }""",
            [TOKEN_KEY, token],
        )
        page.goto(BASE_URL, wait_until="domcontentloaded")
        page.wait_for_timeout(3500)
        page.wait_for_selector("text=Logout", timeout=15000)
        page.screenshot(path=str(ASSETS / "dashboard-home.png"))
        print("Captured dashboard", flush=True)

        tab_names = [
            ("menu", "Menu"),
            ("orders", "Orders"),
            ("manage-orders", "Manage Orders"),
            ("inventory", "Inventory"),
            ("ledger", "Ledger"),
            ("expenses", "Expenses"),
            ("reports", "Reports"),
            ("access", "Access"),
        ]

        for file_name, label in tab_names:
            print(f"Opening {label}", flush=True)
            page.get_by_role("button", name=label, exact=True).click(force=True)
            page.wait_for_timeout(1800)

            if label == "Reports":
                try:
                    page.get_by_role("button", name="Generate Reports").click()
                    page.wait_for_timeout(2000)
                except Exception:
                    pass

            page.evaluate("window.scrollTo(0, 0)")
            page.screenshot(path=str(ASSETS / f"{file_name}.png"))
            print(f"Captured {label}", flush=True)

        display = context.new_page()
        display.set_viewport_size({"width": 1600, "height": 900})
        display.goto(f"{BASE_URL}/display", wait_until="domcontentloaded")
        display.wait_for_timeout(1500)
        display.screenshot(path=str(ASSETS / "display.png"))
        print("Captured display", flush=True)

        browser.close()


if __name__ == "__main__":
    capture()
