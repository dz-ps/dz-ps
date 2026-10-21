import { assertEquals } from 'jsr:@std/assert@1';
import { slugify } from '../_shared/riftbuild-shared/index.ts';

Deno.test('Deno runs the shared rule code (same .ts sources as the app)', () => {
  assertEquals(slugify("Kai'Sa"), 'kaisa');
});
