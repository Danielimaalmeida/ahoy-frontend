import type { PlaywrightTestConfig } from '@playwright/test';
import { devices } from '@playwright/test';

const isCI = !!process.env['CI'];

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config: PlaywrightTestConfig = {
  testDir: './playwright/tests',
  snapshotDir: './playwright/snapshots',
  snapshotPathTemplate: '{snapshotDir}/{projectName}/{testName}{ext}',
  /* Folder for test artifacts such as screenshots, videos, traces, etc. */
  outputDir: 'playwright/results/',
  /* Maximum time one test can run for. */
  timeout: 30 * 1000,
  expect: {
    /**
     * Maximum time expect() should wait for the condition to be met.
     * For example in `await expect(locator).toHaveText();`
     */
    timeout: 5000,
    /**
     * Defining thresholds for visual regression tests.
     * You can adjust these values based on your product tolerance level, but bare in mind that you are "relaxing" the comparison
     */
    toHaveScreenshot: {
      threshold: 0,
      maxDiffPixelRatio: 0,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: isCI,
  /**
   * You can adjust the number of retries.
   * Keep in mind: if a test fails but passes on retry, Playwright marks it as "flaky". So even though it passes in CI, it may not be fully reliable.
   */
  retries: isCI ? 1 : 0,
  /* Opt out of parallel tests on CI. */
  workers: isCI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html', { open: 'never' }], ['list']],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* To bypass the CORS issue */
    launchOptions: {
      args: ['--disable-web-security'],
    },
    /* Maximum time each action such as `click()` can take. Defaults to 0 (no limit). */
    actionTimeout: 0,
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:4200/',
    /**
     * Run browsers in headless mode for consistent and stable Visual Regression Testing.
     * Headless mode avoids UI artifacts and OS-level popups that can affect screenshots.
     */
    headless: isCI,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /**
   * Sample configuration that targets different devices and browser engines.
   * Adapt it to your needs and non-functional requirements.
   * The full list of available possibilities can be found here: https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/deviceDescriptorsSource.json
   */
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        /* To bypass the CORS issue */
        launchOptions: {
          args: ['--disable-web-security'],
        },
        ...devices['Desktop Edge'],
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run start',
    port: 4200,
    timeout: 10 * 60 * 1000,
    reuseExistingServer: true,
  },
};

export default config;
