import { test, expect } from "@playwright/test";
test("Nightly crawl", async ({ page }) => {
  const b=process.env.PLAYWRIGHT_BASE_URL||"http://localhost:5173";
  await page.goto(b,{waitUntil:"networkidle"});
  await page.screenshot({path:"playwright/artifacts/home.png",fullPage:true});
  await page.goto(`${b}/portal`,{waitUntil:"networkidle"});
  await expect(page.locator("text=Professional Learning Portal")).toBeVisible();
});
