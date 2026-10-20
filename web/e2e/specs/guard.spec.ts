import { hostTest, expect } from '../fixtures';
import { productFrameHandle } from '../helpers';

const test = hostTest({ accounts: ['bob'] });

// Self-test of the guard fixture: an error thrown in the PRODUCT iframe and a
// cross-origin load it makes must both be caught, or every other spec's
// "no errors" check is vacuous.
test('guard catches uncaught errors and CSP violations inside the product frame', async ({
  testHost,
  guard,
}) => {
  await testHost.waitForConnection(60_000);
  const frame = productFrameHandle(testHost);

  await frame.evaluate(() => {
    console.log('guard-self-test: console from product');
    setTimeout(() => {
      throw new Error('guard-self-test: uncaught');
    });
    const img = document.createElement('img');
    img.src = 'https://example.com/guard-self-test.png';
    document.body.appendChild(img);
  });

  await expect
    .poll(() => guard.problems.map((p) => p.kind).sort())
    .toEqual(['csp', 'pageerror']);
  expect(guard.console.some((l) => l.includes('guard-self-test: console from product'))).toBe(
    true
  );
  expect(guard.problems.find((p) => p.kind === 'pageerror')?.text).toContain(
    'guard-self-test: uncaught'
  );
  expect(guard.problems.find((p) => p.kind === 'csp')?.text).toContain('example.com');

  // Expected problems: clear them so the guard's teardown check passes.
  guard.problems.length = 0;
});
