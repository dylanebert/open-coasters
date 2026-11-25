import assert from 'node:assert/strict';

export async function signedAxisLabels(view) {
  const labels = await view.locator('.viewport svg text').allTextContents();
  assert.deepEqual(labels, ['+X', '+Y', '−Z'], 'signed travel axes');
  return labels;
}
