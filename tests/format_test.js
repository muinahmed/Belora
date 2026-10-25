// formatText: how text typed in the admin (descriptions, product details) is laid out.

// storefront.js opens the database on import, so point it at a throwaway folder first.
Deno.env.set("DATA_DIR", await Deno.makeTempDir({ prefix: "bellora-format-" }));
const { formatText } = await import("../storefront.js");

function assertEquals(actual, expected) {
  if (actual !== expected) throw new Error(`expected\n${expected}\ngot\n${actual}`);
}

Deno.test("bullets, indented sub-bullets and a CAPITAL heading keep their layout", () => {
  const typed = [
    "· Finish: Dewy and luminous.",
    "· Coverage: Medium-to-full.",
    "",
    "CATEGORY",
    "· 1. 361C - Nude Ivory",
    "\t· This is a very fair shade.",
    "        · It suits neutral undertones.",
    "· 2. 362C - Soft Ivory",
    "    · This is a light shade."
  ].join("\n");
  assertEquals(formatText(typed),
    "<ul><li>Finish: Dewy and luminous.</li><li>Coverage: Medium-to-full.</li></ul>" +
    '<h3 class="text-heading">CATEGORY</h3>' +
    "<ul><li>1. 361C - Nude Ivory<ul><li>This is a very fair shade.</li><li>It suits neutral undertones.</li></ul></li>" +
    "<li>2. 362C - Soft Ivory<ul><li>This is a light shade.</li></ul></li></ul>");
});

Deno.test("single line breaks are kept; blank lines start a new paragraph", () => {
  assertEquals(formatText("Line one\nLine two\n\nNew paragraph"), "<p>Line one<br>Line two</p><p>New paragraph</p>");
});

Deno.test("other bullet styles work, and Windows line endings too", () => {
  assertEquals(formatText("• One\r\n- Two\r\n* Three"), "<ul><li>One</li><li>Two</li><li>Three</li></ul>");
});

Deno.test("short codes and sentences in capitals stay normal text", () => {
  assertEquals(formatText("361C"), "<p>361C</p>");
  assertEquals(formatText("NEW ARRIVAL!"), "<p>NEW ARRIVAL!</p>");
});

Deno.test("everything is escaped", () => {
  assertEquals(formatText("· <b>bold</b> & more"), "<ul><li>&lt;b&gt;bold&lt;/b&gt; &amp; more</li></ul>");
});
