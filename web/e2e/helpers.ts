import type { Frame, FrameLocator } from '@playwright/test';
import type { TestHost } from '@parity/host-api-test-sdk/playwright';
import { expect, PRODUCT_URL } from './fixtures';

export interface Connected {
  frame: FrameLocator;
  /** The product account the host gave OAB (SS58, prefix 0). */
  address: string;
}

/** Wait for the product, press CONNECT, and return the host account. */
export async function connect(testHost: TestHost): Promise<Connected> {
  await testHost.waitForConnection(60_000);
  const frame = testHost.productFrame();
  await frame.getByRole('button', { name: 'CONNECT' }).click();
  const option = frame.getByTestId('account-option');
  await expect(option).toHaveCount(1, { timeout: 60_000 });
  const address = await option.getAttribute('data-address');
  if (!address) throw new Error('account option has no data-address');
  return { frame, address };
}

/** The product iframe as a `Frame` (for `evaluate`). */
export function productFrameHandle(testHost: TestHost): Frame {
  const frame = testHost.page.frames().find((f) => f.url().startsWith(PRODUCT_URL));
  if (!frame) throw new Error(`no frame at ${PRODUCT_URL}`);
  return frame;
}

/**
 * Record, in the product frame, whether `text` is ever rendered. Returns a
 * reader. Catches a transient overlay a later assertion would miss.
 */
export async function watchForText(frame: Frame, text: string): Promise<() => Promise<boolean>> {
  const key = `__seen_${text.replace(/\W/g, '_')}`;
  await frame.evaluate(
    ([t, k]) => {
      const w = window as unknown as Record<string, boolean>;
      w[k] = document.body.innerText.includes(t);
      new MutationObserver(() => {
        if (document.body.innerText.includes(t)) w[k] = true;
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    },
    [text, key] as const
  );
  return () => frame.evaluate((k) => (window as unknown as Record<string, boolean>)[k] === true, key);
}
