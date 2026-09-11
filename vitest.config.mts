import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * إعداد vitest — كان ناقص، وده سبب إن lib/personal-assistant/__tests__/
 * briefing.test.ts كان بيقع بـ "Cannot find package '@/lib/...'": الملفات
 * بتستورد بمسارات tsconfig (paths في tsconfig.json) و vite ما يقراش
 * tsconfig paths من غير alias صريح.
 *
 * مفيش أي إعداد تاني: الافتراضيات زي ما هي، والاختبارات اللي كانت شغالة
 * قبل كده بتفضل شغالة بنفس الطريقة.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
